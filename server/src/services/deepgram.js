const axios = require('axios');
const logger = require('../utils/logger');

const DEEPGRAM_API_URL = 'https://api.deepgram.com/v1/listen';

/**
 * Transcribe audio using Deepgram Nova-2
 * @param {Buffer} audioBuffer - Raw audio data
 * @param {string} mimeType - Audio MIME type (e.g., 'audio/wav', 'audio/m4a')
 * @returns {Object} { transcript, confidence, words, duration }
 */
const transcribeAudio = async (audioBuffer, mimeType = 'audio/wav') => {
  const startTime = Date.now();

  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error('DEEPGRAM_API_KEY not configured');
    }

    const response = await axios.post(
      DEEPGRAM_API_URL,
      audioBuffer,
      {
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': mimeType,
        },
        params: {
          model: 'nova-2',
          language: 'en',
          smart_format: true,
          punctuate: true,
          diarize: false,
          filler_words: false,
          detect_entities: true,
        },
        maxContentLength: 25 * 1024 * 1024, // 25MB max
        timeout: 30000, // 30 second timeout
      }
    );

    const result = response.data.results?.channels?.[0]?.alternatives?.[0];

    if (!result) {
      throw new Error('No transcription result returned from Deepgram');
    }

    const processingTime = Date.now() - startTime;
    logger.info(`Deepgram transcription completed in ${processingTime}ms`, {
      confidence: result.confidence,
      wordCount: result.words?.length || 0,
    });

    return {
      transcript: result.transcript,
      confidence: result.confidence,
      words: result.words || [],
      duration: response.data.metadata?.duration || 0,
      processingTimeMs: processingTime,
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error(`Deepgram transcription failed after ${processingTime}ms:`, {
      error: error.message,
      status: error.response?.status,
    });

    if (error.response?.status === 401) {
      throw new Error('Invalid Deepgram API key');
    }
    if (error.response?.status === 402) {
      throw new Error('Deepgram API quota exceeded');
    }

    throw new Error(`Transcription failed: ${error.message}`);
  }
};

/**
 * Transcribe audio from base64 string
 */
const transcribeBase64 = async (base64Audio, mimeType = 'audio/wav') => {
  const audioBuffer = Buffer.from(base64Audio, 'base64');
  return transcribeAudio(audioBuffer, mimeType);
};

module.exports = { transcribeAudio, transcribeBase64 };
