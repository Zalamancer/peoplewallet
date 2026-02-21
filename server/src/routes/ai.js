const express = require('express');
const multer = require('multer');
const { query } = require('../config/database');
const { authenticate, requirePro } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const deepgramService = require('../services/deepgram');
const extractionService = require('../services/extraction');
const logger = require('../utils/logger');

const router = express.Router();

// Multer for audio file uploads (stored in memory, not disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/wav', 'audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/webm', 'audio/x-m4a'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`), false);
    }
  },
});

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/ai/transcribe
 * Transcribe audio and extract contact information
 * This is the core AI pipeline: Audio → Deepgram → GPT-4o-mini → Structured Contact
 */
router.post(
  '/transcribe',
  requirePro,
  upload.single('audio'),
  auditLog('ai_transcribe', 'transcription'),
  async (req, res) => {
    const startTime = Date.now();

    try {
      let transcript;
      let transcriptionResult;

      if (req.file) {
        // Mode A (Dictation) or Mode C (Recording): Transcribe audio file
        logger.info('Processing audio file for transcription', {
          mimeType: req.file.mimetype,
          size: req.file.size,
        });

        transcriptionResult = await deepgramService.transcribeAudio(
          req.file.buffer,
          req.file.mimetype
        );
        transcript = transcriptionResult.transcript;

        if (!transcript || transcript.trim().length === 0) {
          return res.status(422).json({
            error: 'Could not transcribe audio',
            message: "I couldn't understand much from the audio. Please try again in a quieter environment or use dictation mode.",
          });
        }
      } else if (req.body.text) {
        // Direct text input (for testing or manual transcript)
        transcript = req.body.text;
        transcriptionResult = {
          transcript,
          confidence: 1.0,
          processingTimeMs: 0,
        };
      } else {
        return res.status(400).json({
          error: 'No audio file or text provided',
          message: 'Please provide an audio file or text transcript',
        });
      }

      // Step 2: Extract entities using GPT-4o-mini
      const extraction = await extractionService.extractContactInfo(transcript);

      // Step 3: Map to contact card fields with confidence-based categorization
      const fields = mapExtractionToFields(extraction);

      // Step 4: Save transcription record
      const transcriptionRecord = await query(
        `INSERT INTO transcriptions (user_id, contact_id, raw_text, extracted_entities, confidence_scores, extraction_model, processing_time_ms)
         VALUES ($1, NULL, $2, $3, $4, 'claude-haiku-4-5', $5) RETURNING id`,
        [
          req.user.id,
          transcript,
          JSON.stringify(extraction),
          JSON.stringify(fields.confidenceScores),
          Date.now() - startTime,
        ]
      );

      const totalTime = Date.now() - startTime;
      logger.info(`AI pipeline completed in ${totalTime}ms`, {
        userId: req.user.id,
        overallConfidence: extraction.overall_confidence,
      });

      res.json({
        transcription: {
          id: transcriptionRecord.rows[0].id,
          text: transcript,
          audioConfidence: transcriptionResult.confidence,
        },
        extraction: {
          fields: fields.categorized,
          raw: extraction,
          overallConfidence: extraction.overall_confidence,
        },
        suggestedContact: fields.contactData,
        processingTimeMs: totalTime,
      });
    } catch (error) {
      logger.error('AI transcribe pipeline error:', error);

      if (error.message.includes('API key')) {
        return res.status(503).json({ error: 'AI service configuration error' });
      }

      res.status(500).json({
        error: 'Transcription pipeline failed',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/ai/extract
 * Extract entities from text only (no audio processing)
 * Useful for re-processing or manual text input
 */
router.post('/extract', requirePro, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const extraction = await extractionService.extractContactInfo(text);
    const fields = mapExtractionToFields(extraction);

    res.json({
      extraction: {
        fields: fields.categorized,
        raw: extraction,
        overallConfidence: extraction.overall_confidence,
      },
      suggestedContact: fields.contactData,
    });
  } catch (error) {
    logger.error('Extract error:', error);
    res.status(500).json({ error: 'Entity extraction failed' });
  }
});

/**
 * POST /api/ai/transcribe-only
 * Transcribe audio without entity extraction
 */
router.post('/transcribe-only', requirePro, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    const result = await deepgramService.transcribeAudio(req.file.buffer, req.file.mimetype);

    res.json({
      transcript: result.transcript,
      confidence: result.confidence,
      duration: result.duration,
      processingTimeMs: result.processingTimeMs,
    });
  } catch (error) {
    logger.error('Transcribe-only error:', error);
    res.status(500).json({ error: 'Transcription failed' });
  }
});

/**
 * POST /api/ai/confirm
 * Confirm and save an AI-extracted contact
 * Links the transcription to the created contact
 */
router.post('/confirm', requirePro, async (req, res) => {
  try {
    const { transcription_id, contact_data } = req.body;

    if (!contact_data || !contact_data.full_name) {
      return res.status(400).json({ error: 'Contact data with full_name is required' });
    }

    // This will trigger the contacts create endpoint logic
    // For now, we update the transcription with the contact_id after creation
    if (transcription_id) {
      // Verify transcription belongs to user
      const txn = await query(
        'SELECT id FROM transcriptions WHERE id = $1 AND user_id = $2',
        [transcription_id, req.user.id]
      );

      if (txn.rows.length === 0) {
        return res.status(404).json({ error: 'Transcription not found' });
      }
    }

    res.json({
      message: 'Use POST /api/contacts to create the contact with the confirmed data',
      contact_data,
    });
  } catch (error) {
    logger.error('AI confirm error:', error);
    res.status(500).json({ error: 'Failed to confirm contact' });
  }
});

/**
 * Map extraction results to contact card fields with confidence categorization
 * Green: >0.7 (auto-populate)
 * Yellow: 0.4-0.7 (suggest with "Confirm?" prompt)
 * Blank: <0.4 (leave empty)
 */
function mapExtractionToFields(extraction) {
  const categorize = (value, confidence) => {
    if (!value || confidence < 0.4) {
      return { value: null, status: 'blank', confidence };
    }
    if (confidence >= 0.7) {
      return { value, status: 'auto', confidence };
    }
    return { value, status: 'suggest', confidence };
  };

  const nameConf = extraction.name?.confidence || 0;
  const profConf = extraction.professional?.confidence || 0;
  const socialConf = extraction.social?.confidence || 0;
  const appearConf = extraction.appearance?.confidence || 0;
  const contextConf = extraction.context?.confidence || 0;

  const categorized = {
    name: {
      full_name: categorize(extraction.name?.full_name, nameConf),
      nickname: categorize(extraction.name?.nickname, nameConf),
      pronouns: categorize(extraction.name?.pronouns, nameConf),
    },
    professional: {
      school: categorize(extraction.professional?.school, profConf),
      graduation_year: categorize(extraction.professional?.graduation_year, profConf),
      major: categorize(extraction.professional?.major, profConf),
      company: categorize(extraction.professional?.company, profConf),
      job_title: categorize(extraction.professional?.job_title, profConf),
      department: categorize(extraction.professional?.department, profConf),
    },
    appearance: {
      height_range: categorize(extraction.appearance?.height_range, appearConf),
      hair_color: categorize(extraction.appearance?.hair_color, appearConf),
      glasses: categorize(extraction.appearance?.glasses, appearConf),
    },
    context: {
      how_met: categorize(extraction.context?.how_met, contextConf),
      event_name: categorize(extraction.context?.event_name, contextConf),
      location: categorize(extraction.context?.location, contextConf),
    },
    interests: extraction.interests || [],
    conversation_topics: extraction.conversation_topics || [],
    follow_up_items: extraction.follow_up_items || [],
  };

  // Build a flat contact data object with only high/medium confidence fields
  const contactData = {
    full_name: extraction.name?.full_name || 'Unknown',
    nickname: extraction.name?.nickname,
    pronouns: extraction.name?.pronouns,
    professional: {
      school: extraction.professional?.school,
      graduation_year: extraction.professional?.graduation_year,
      major: extraction.professional?.major,
      company: extraction.professional?.company,
      job_title: extraction.professional?.job_title,
      department: extraction.professional?.department,
    },
    appearance: {
      height_range: extraction.appearance?.height_range,
      hair_color: extraction.appearance?.hair_color,
      glasses: extraction.appearance?.glasses,
      distinguishing_features: extraction.appearance?.distinguishing_features || [],
    },
    context: {
      how_met: extraction.context?.how_met,
      event_name: extraction.context?.event_name,
      met_date: extraction.context?.met_date,
      location: extraction.context?.location,
      mutual_connections: extraction.context?.mutual_connections || [],
    },
    notes: [],
    tags: [],
  };

  // Add conversation summary as a note
  if (extraction.conversation_summary) {
    contactData.notes.push({
      content: extraction.conversation_summary,
      source: 'ai_generated',
    });
  }

  // Add follow-up items as notes
  if (extraction.follow_up_items?.length > 0) {
    contactData.notes.push({
      content: `Follow-up items: ${extraction.follow_up_items.join(', ')}`,
      source: 'ai_generated',
    });
  }

  const confidenceScores = {
    name: nameConf,
    professional: profConf,
    social: socialConf,
    appearance: appearConf,
    context: contextConf,
    overall: extraction.overall_confidence || 0,
  };

  return { categorized, contactData, confidenceScores };
}

module.exports = router;
