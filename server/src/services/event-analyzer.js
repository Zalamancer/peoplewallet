const { query } = require('../config/database');
const logger = require('../utils/logger');
const axios = require('axios');
const { extractTextFromImages, assessOcrQuality, downloadImagesAsBase64 } = require('./ocr-service');
const { geocodeEventLocation } = require('./campus-geocoder');

/**
 * Event Analyzer Service — Pipeline 3
 *
 * Uses Claude API (claude-sonnet-4-5-20250929 with vision) to analyze Instagram
 * posts from student clubs and extract structured event data.
 *
 * For each new post:
 *   1. Send image(s) + caption to Claude
 *   2. Parse the structured JSON response
 *   3. If is_event: true, insert into events table with feed_score
 *   4. Update post's ai_analysis_status
 */

/**
 * The full Claude event extraction prompt.
 * The {post_timestamp} placeholder is replaced at call time with the actual
 * post publication date so Claude can resolve relative date references.
 */
const EVENT_EXTRACTION_PROMPT = `You are an AI assistant that analyzes social media posts from university student organizations to extract event information.

You may receive the post caption, OCR-extracted text from images, or the actual images themselves. Use ALL available sources to identify events and extract details.

The post was published on: {post_timestamp}
The current year is ${new Date().getFullYear()}.

Given the following post from a student club at UT Dallas, determine:

1. **Is this an event or activity announcement?** (yes/no)
   - YES if it mentions ANY of: meetings, workshops, socials, info sessions, fundraisers, competitions, hackathons, performances, study sessions, guest speakers, career fairs, webinars, practices, tryouts, applications with deadlines, registration deadlines, networking events, cultural shows, sports events, game nights, movie nights, coding sessions, resume reviews, panel discussions, iftars, prayers, etc.
   - YES if it uses action words like: "join us", "come out", "register", "sign up", "attend", "RSVP", "don't miss", "mark your calendars", inviting language, or includes a link to register/RSVP.
   - YES even if the date/time are missing from the caption (they may be in the image flyer).
   - NOT events: memes, throwback photos, member spotlights/introductions, congratulations posts, general announcements without any gathering.

2. If YES, extract into this JSON structure (one object per event):

{
  "is_event": true,
  "confidence": 0.85,
  "event_name": "Spring Kickoff Social",
  "event_type": "social",
  "description": "Brief 1-2 sentence description",
  "date": "2026-02-15",
  "date_raw": "February 15th",
  "time_start": "18:00",
  "time_end": "20:00",
  "time_raw": "6-8 PM",
  "location": "ECSW 1.315",
  "location_building": "Engineering and Computer Science West",
  "is_on_campus": true,
  "food_available": true,
  "food_details": "Free pizza and drinks",
  "dress_code": null,
  "dress_code_details": null,
  "is_free": true,
  "cost": null,
  "rsvp_required": false,
  "rsvp_link": null,
  "capacity_limited": false,
  "open_to_all": true,
  "membership_required": false,
  "perks": ["free food"],
  "tags": ["social"],
  "contact_info": null,
  "recurring": false,
  "recurring_pattern": null
}

Event type options: meeting, workshop, social, info_session, fundraiser, competition, performance, study_session, guest_speaker, career_fair, sports, cultural, religious, other

3. If NOT an event, return:
{ "is_event": false, "post_type": "meme" }
Post type options: meme, spotlight, recruitment, announcement, throwback, other

CRITICAL RULES FOR MULTIPLE EVENTS:
- If a post contains a SCHEDULE, CALENDAR, or LIST of events (e.g. a Ramadan iftar schedule, a week-of-events flyer, a semester calendar), you MUST create a SEPARATE event object for EACH individual date+activity combination.
- DO NOT group or summarize multiple events into one. Each row/entry in a schedule = one event object in your JSON array.
- Example: A flyer showing "02/18 MSA Iftar @ Galaxy AB" and "02/19 Intercultural Iftar @ SCI Courtyard" must produce TWO separate event objects, not one "Iftars on Campus" summary.
- Return a JSON array of event objects when there are multiple events. Single event = single object (no array wrapper).
- For dates like "02/18" or "2/18" without a year, use the current year (${new Date().getFullYear()}). The full date should be "${new Date().getFullYear()}-02-18" format.

OTHER RULES:
- If a field's info is not available, set it to null. Do NOT guess or hallucinate.
- If the date says "this Friday" or "tomorrow", calculate from the post date: {post_timestamp}.
- UTD campus building abbreviations: ECSW = Engineering & Computer Science West, ECSS = Engineering & Computer Science South, SCI = Science Building, JSOM = Jindal School of Management, SU = Student Union, AB = Activity Center, ATC = Activity Center Theater, FN = Founders North, CB = Classroom Building, GR = Green Hall, HH = Hoblitzelle Hall, MC = Math/CS Building, FO = Founders, SSA = Student Services Addition, Galaxy = Galaxy rooms in Student Union
- For food: look for "free food", "pizza", "refreshments", "snacks", "catered", food emojis, "iftar" (iftar IS food).
- cost must be a number or null, never a string like "500-1000 dollars".
- Respond with ONLY valid JSON, no markdown formatting or backticks.`;

/**
 * Build the messages array for the Claude API request.
 *
 * When useVision is false (default), sends caption + OCR text as plain text.
 * When useVision is true (OCR quality too low), sends actual images to Claude
 * via the vision API so it can read stylized flyers directly.
 *
 * @param {string[]} imageUrls - Array of image URLs from the post
 * @param {string} caption - Post caption text
 * @param {string} postedAt - ISO timestamp of when the post was published
 * @param {string} ocrText - Text extracted from post images via OCR
 * @param {Array<{ base64: string, mediaType: string }>} [base64Images] - Downloaded images for vision fallback
 * @returns {Array} Messages array for the Claude API
 */
const buildClaudeMessages = (imageUrls, caption, postedAt, ocrText, base64Images) => {
  const promptText = EVENT_EXTRACTION_PROMPT.replace(
    '{post_timestamp}',
    postedAt || 'unknown'
  );

  const captionText = caption
    ? `\n\nPost caption:\n${caption}`
    : '\n\n(No caption provided)';

  // Vision mode: send base64 images directly to Claude
  if (base64Images && base64Images.length > 0) {
    const contentBlocks = [];

    for (const img of base64Images) {
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
      });
    }

    contentBlocks.push({
      type: 'text',
      text: promptText + captionText + '\n\n(Images are provided above — read all text from the flyers/graphics directly.)',
    });

    return [{ role: 'user', content: contentBlocks }];
  }

  // Text-only mode: send caption + OCR text
  const ocrSection = ocrText
    ? `\n\nExtracted text from post images (via OCR):\n${ocrText}`
    : '\n\n(No text extracted from images)';

  return [
    {
      role: 'user',
      content: promptText + captionText + ocrSection,
    },
  ];
};

/**
 * Analyze a single post for event information using Claude vision.
 *
 * Fetches the post from the DB, sends it to Claude for analysis,
 * and if an event is detected, inserts it into the events table
 * with a calculated feed_score.
 *
 * @param {string} postId - UUID of the post to analyze
 * @returns {{ is_event: boolean, event_id: string|null, confidence: number|null }}
 */
const analyzePost = async (postId) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('ANTHROPIC_API_KEY not configured, skipping post analysis');
    return { is_event: false, event_id: null, confidence: null };
  }

  try {
    // Fetch the post and its associated club
    const postResult = await query(
      `SELECT p.*, c.ranking_score, c.id AS club_id_ref, c.name AS club_name
       FROM posts p
       JOIN clubs c ON c.id = p.club_id
       WHERE p.id = $1`,
      [postId]
    );

    if (postResult.rows.length === 0) {
      logger.warn(`Post ${postId} not found`);
      return { is_event: false, event_id: null, confidence: null };
    }

    const post = postResult.rows[0];
    const imageUrls = post.image_urls || [];
    const caption = post.caption || '';
    const postedAt = post.posted_at
      ? new Date(post.posted_at).toISOString()
      : new Date(post.created_at).toISOString();

    // Run OCR on images if not already done
    let ocrText = post.ocr_text || '';
    if (!post.ocr_text && post.ocr_status !== 'completed' && post.ocr_status !== 'no_images') {
      if (imageUrls.length === 0) {
        await query(
          "UPDATE posts SET ocr_status = 'no_images' WHERE id = $1",
          [postId]
        );
      } else {
        try {
          ocrText = await extractTextFromImages(imageUrls);
          await query(
            "UPDATE posts SET ocr_text = $1, ocr_status = 'completed' WHERE id = $2",
            [ocrText || null, postId]
          );
          logger.info(`OCR completed for post ${postId}: ${ocrText.length} chars extracted`);
        } catch (ocrError) {
          logger.error(`OCR failed for post ${postId}:`, ocrError.message);
          await query(
            "UPDATE posts SET ocr_status = 'failed' WHERE id = $1",
            [postId]
          );
        }
      }
    }

    // Check OCR quality — if poor, fall back to vision API
    const ocrQuality = assessOcrQuality(ocrText, imageUrls.length);
    const useVision = imageUrls.length > 0 && !ocrQuality.usable;

    // If vision needed, download images as base64 (Instagram blocks Claude from fetching URLs directly)
    let base64Images = null;
    if (useVision) {
      logger.info(`Post ${postId}: OCR quality low (score=${ocrQuality.score}, reason=${ocrQuality.reason}), downloading images for vision fallback`);
      base64Images = await downloadImagesAsBase64(imageUrls);
      if (base64Images.length === 0) {
        logger.warn(`Post ${postId}: Failed to download any images for vision, proceeding with OCR text only`);
        base64Images = null;
      } else {
        logger.info(`Post ${postId}: Downloaded ${base64Images.length} images for Claude Vision`);
      }
    }

    // Build and send the request to Claude
    const messages = buildClaudeMessages(imageUrls, caption, postedAt, ocrText, base64Images);

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages,
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const textBlock = response.data.content.find((b) => b.type === 'text');
    if (!textBlock) {
      logger.error(`No text block in Claude response for post ${postId}`);
      await query(
        "UPDATE posts SET ai_analysis_status = 'not_event' WHERE id = $1",
        [postId]
      );
      return { is_event: false, event_id: null, confidence: null };
    }

    // Parse the AI response — strip markdown code fences if present
    let analysis;
    try {
      let jsonText = textBlock.text.trim();
      // Strip ```json ... ``` wrapping
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      logger.error(`Failed to parse Claude JSON for post ${postId}:`, parseError.message);
      logger.debug('Raw response:', textBlock.text);
      await query(
        "UPDATE posts SET ai_analysis_status = 'not_event' WHERE id = $1",
        [postId]
      );
      return { is_event: false, event_id: null, confidence: null };
    }

    // Normalize response: handle both single object and array of events
    const events = Array.isArray(analysis) ? analysis : [analysis];

    // Check if any event was detected
    const detectedEvents = events.filter((e) => e.is_event);
    if (detectedEvents.length === 0) {
      await query(
        "UPDATE posts SET ai_analysis_status = 'not_event' WHERE id = $1",
        [postId]
      );
      const postType = events[0]?.post_type || 'unknown';
      logger.debug(`Post ${postId} is not an event (type: ${postType})`);
      return { is_event: false, event_id: null, confidence: null };
    }

    // Insert each detected event
    const clubRankingScore = post.ranking_score || 0;
    const eventIds = [];

    for (const evt of detectedEvents) {
      const aiConfidence = evt.confidence || 0;
      const feedScore = clubRankingScore * 0.6 + aiConfidence * 40;

      // Sanitize cost — DB expects numeric, Claude sometimes returns strings like "500-1000 dollars"
      let costValue = evt.cost || null;
      if (costValue && typeof costValue === 'string') {
        const numMatch = costValue.match(/(\d+(\.\d+)?)/);
        costValue = numMatch ? parseFloat(numMatch[1]) : null;
      }

      let eventResult;
      try {
        eventResult = await query(
        `INSERT INTO events (
          name, post_id, club_id, event_name, event_type, description,
          event_date, time_start, time_end, location, location_building,
          is_on_campus, food_available, food_details, dress_code, dress_code_details,
          is_free, cost, rsvp_required, rsvp_link, open_to_all,
          perks, tags, contact_info, recurring, recurring_pattern,
          ai_confidence, feed_score, raw_ai_response, source, status
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22, $23, $24, $25, $26,
          $27, $28, $29, 'instagram_ai', 'active'
        ) RETURNING id`,
        [
          evt.event_name || evt.event_type || 'Untitled Event',
          postId,
          post.club_id,
          evt.event_name || null,
          evt.event_type || null,
          evt.description || null,
          evt.date || null,
          evt.time_start || null,
          evt.time_end || null,
          evt.location || null,
          evt.location_building || null,
          evt.is_on_campus != null ? evt.is_on_campus : null,
          evt.food_available != null ? evt.food_available : false,
          evt.food_details || null,
          evt.dress_code || null,
          evt.dress_code_details || null,
          evt.is_free != null ? evt.is_free : true,
          costValue,
          evt.rsvp_required != null ? evt.rsvp_required : false,
          evt.rsvp_link || null,
          evt.open_to_all != null ? evt.open_to_all : true,
          evt.perks || null,
          evt.tags || null,
          evt.contact_info || null,
          evt.recurring != null ? evt.recurring : false,
          evt.recurring_pattern || null,
          aiConfidence,
          feedScore,
          JSON.stringify(evt),
        ]
      );

        const eventId = eventResult.rows[0].id;
        eventIds.push(eventId);
        logger.info(`Event created from post ${postId}: "${evt.event_name}" (confidence: ${aiConfidence}, feed_score: ${feedScore.toFixed(1)})`);

        // Non-blocking geocoding — failure doesn't affect event creation
        geocodeEventLocation(evt.location, evt.location_building, evt.is_on_campus)
          .then((coords) => {
            if (coords) {
              query(
                'UPDATE events SET latitude = $1, longitude = $2, geocode_source = $3 WHERE id = $4',
                [coords.lat, coords.lng, coords.source, eventId]
              ).catch((e) => logger.warn(`Geocode DB update failed for event ${eventId}:`, e.message));
            }
          })
          .catch((e) => logger.warn(`Geocoding failed for event ${eventId}:`, e.message));
      } catch (insertError) {
        logger.error(`Failed to insert event "${evt.event_name}" from post ${postId}:`, insertError.message);
      }
    }

    // Mark the post as analyzed
    await query(
      "UPDATE posts SET ai_analysis_status = 'analyzed' WHERE id = $1",
      [postId]
    );

    logger.info(`Post ${postId}: ${eventIds.length} event(s) created`);
    return { is_event: true, event_id: eventIds[0], event_ids: eventIds, confidence: detectedEvents[0].confidence };
  } catch (error) {
    logger.error(`Error analyzing post ${postId}:`, error.message);
    return { is_event: false, event_id: null, confidence: null };
  }
};

/**
 * Analyze all pending posts for event information.
 *
 * Gets all posts where ai_analysis_status='pending', calls analyzePost
 * for each, and returns aggregate statistics.
 *
 * @returns {{ analyzed: number, events_created: number, not_events: number, errors: number }}
 */
const analyzePendingPosts = async () => {
  const batchLimit = parseInt(process.env.ANALYZE_BATCH_LIMIT, 10) || 20;
  logger.info(`Starting AI event analysis for pending posts (batch limit: ${batchLimit})`);

  let analyzed = 0;
  let events_created = 0;
  let not_events = 0;
  let errors = 0;

  try {
    const result = await query(
      "SELECT id FROM posts WHERE ai_analysis_status = 'pending' ORDER BY created_at ASC LIMIT $1",
      [batchLimit]
    );

    logger.info(`Found ${result.rows.length} pending posts to analyze in parallel`);

    // Analyze all posts in parallel
    const analysisResults = await Promise.allSettled(
      result.rows.map((post) => analyzePost(post.id))
    );

    for (const res of analysisResults) {
      if (res.status === 'fulfilled') {
        analyzed++;
        if (res.value.is_event) {
          events_created += res.value.event_ids ? res.value.event_ids.length : 1;
        } else {
          not_events++;
        }
      } else {
        logger.error('Post analysis rejected:', res.reason?.message || res.reason);
        errors++;
      }
    }
  } catch (error) {
    logger.error('Error fetching pending posts for analysis:', error.message);
    return { analyzed: 0, events_created: 0, not_events: 0, errors: 1 };
  }

  logger.info(`Event analysis complete: ${analyzed} analyzed, ${events_created} events created, ${not_events} not events, ${errors} errors`);
  return { analyzed, events_created, not_events, errors };
};

module.exports = {
  analyzePost,
  analyzePendingPosts,
  buildClaudeMessages,
};
