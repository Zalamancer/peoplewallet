const Anthropic = require('@anthropic-ai/sdk').default;
const logger = require('../utils/logger');

let anthropicClient;

const getClient = () => {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
};

/**
 * The extraction prompt — the most important piece of code in the app.
 * Handles messy conversational input and produces clean structured output.
 */
const EXTRACTION_PROMPT = `You are a contact information extractor. Given a transcript of someone describing a person they just met, extract structured information.

Return ONLY valid JSON with these fields:
{
  "name": {
    "full_name": string | null,
    "nickname": string | null,
    "pronouns": string | null,
    "confidence": number (0-1)
  },
  "professional": {
    "school": string | null,
    "graduation_year": string | null,
    "major": string | null,
    "company": string | null,
    "job_title": string | null,
    "department": string | null,
    "confidence": number (0-1)
  },
  "social": {
    "linkedin": string | null,
    "instagram": string | null,
    "twitter": string | null,
    "github": string | null,
    "website": string | null,
    "confidence": number (0-1)
  },
  "appearance": {
    "height_range": "short" | "average" | "tall" | "very_tall" | null,
    "hair_color": "black" | "brown" | "blonde" | "red" | "gray" | "white" | "other" | "none" | null,
    "glasses": boolean | null,
    "distinguishing_features": string[] | [],
    "confidence": number (0-1)
  },
  "context": {
    "how_met": string | null,
    "event_name": string | null,
    "met_date": string | null,
    "location": string | null,
    "mutual_connections": string[] | [],
    "confidence": number (0-1)
  },
  "interests": string[],
  "conversation_topics": string[],
  "follow_up_items": string[],
  "conversation_summary": string | null,
  "overall_confidence": number (0-1)
}

RULES:
1. If a field is not mentioned, set it to null.
2. Normalize school names (e.g., "UT Dallas" -> "University of Texas at Dallas").
3. Infer graduation year from context clues (e.g., "graduating next year" + current date -> appropriate year).
4. For each category, include a confidence score from 0 to 1.
5. NEVER infer race, ethnicity, religion, political affiliation, sexual orientation, or health information.
6. If the speaker uses casual language, still extract structured data (e.g., "she's in CS" -> major: "Computer Science").
7. Distinguish between the speaker and the person being described — only extract info about the person being described.
8. For appearance, only use the predefined categories. Do not add free-text appearance descriptions.
9. The overall_confidence should reflect the average quality and completeness of the extraction.
10. Return ONLY the JSON object, no markdown fences, no explanation.`;

/**
 * Extract structured contact information from a transcript using Claude 3.5 Haiku
 * @param {string} transcript - The raw transcription text
 * @returns {Object} Structured extraction with confidence scores
 */
const extractContactInfo = async (transcript) => {
  const startTime = Date.now();

  try {
    const client = getClient();

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Extract contact information from this transcript:\n\n"${transcript}"`,
        },
      ],
      system: EXTRACTION_PROMPT,
      temperature: 0.1, // Low temperature for consistent extraction
    });

    const content = response.content[0]?.text;
    if (!content) {
      throw new Error('No content returned from Claude');
    }

    // Parse JSON - Claude may sometimes wrap in markdown fences
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const extracted = JSON.parse(jsonStr);
    const processingTime = Date.now() - startTime;

    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    logger.info(`Entity extraction completed in ${processingTime}ms`, {
      overallConfidence: extracted.overall_confidence,
      tokensUsed,
      model: 'claude-haiku-4-5',
    });

    return {
      ...extracted,
      processingTimeMs: processingTime,
      tokensUsed,
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error(`Entity extraction failed after ${processingTime}ms:`, {
      error: error.message,
    });

    if (error.message.includes('API key') || error.message.includes('authentication')) {
      throw new Error('Invalid Anthropic API key');
    }

    throw new Error(`Entity extraction failed: ${error.message}`);
  }
};

/**
 * Generate a follow-up nudge for a contact
 */
const generateNudge = async (contactName, lastInteraction, context) => {
  try {
    const client = getClient();

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `Generate a reconnection nudge for ${contactName}. Last interaction: ${lastInteraction}. Context: ${context}`,
        },
      ],
      system:
        'You are a helpful networking assistant. Generate a brief, friendly nudge message to help the user reconnect with a contact. Keep it under 2 sentences. Be warm but not pushy.',
      temperature: 0.7,
    });

    return response.content[0]?.text || null;
  } catch (error) {
    logger.error('Nudge generation failed:', error.message);
    return null;
  }
};

module.exports = { extractContactInfo, generateNudge };
