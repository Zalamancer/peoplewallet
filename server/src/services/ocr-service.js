const { createWorker } = require('tesseract.js');
const sharp = require('sharp');
const axios = require('axios');
const logger = require('../utils/logger');

const MAX_IMAGES = 5;
let worker = null;

/**
 * Get or create a reusable Tesseract worker.
 */
const getWorker = async () => {
  if (!worker) {
    worker = await createWorker('eng');
    logger.info('Tesseract OCR worker initialized');
  }
  return worker;
};

/**
 * Download an image and return its buffer.
 * Returns null if the download fails (e.g. expired CDN URL).
 */
const downloadImage = async (url) => {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    return Buffer.from(response.data);
  } catch (error) {
    logger.warn(`Failed to download image (likely expired CDN URL): ${error.message}`);
    return null;
  }
};

/**
 * Preprocess an image buffer with Sharp to improve OCR accuracy.
 * - Resize to 1500px wide (maintains aspect ratio)
 * - Convert to grayscale
 * - Normalize contrast
 * - Sharpen
 */
const preprocessImage = async (buffer) => {
  return sharp(buffer)
    .resize(1500, null, { withoutEnlargement: true })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
};

/**
 * Extract text from an array of image URLs using Tesseract OCR.
 *
 * @param {string[]} imageUrls - Array of image URLs to process
 * @returns {string} Combined OCR text from all images, separated by --- Image N --- headers
 */
const extractTextFromImages = async (imageUrls) => {
  if (!imageUrls || imageUrls.length === 0) {
    return '';
  }

  const urlsToProcess = imageUrls.slice(0, MAX_IMAGES);
  const ocrWorker = await getWorker();
  const textParts = [];

  for (let i = 0; i < urlsToProcess.length; i++) {
    const url = urlsToProcess[i];
    if (!url) continue;

    try {
      const imageBuffer = await downloadImage(url);
      if (!imageBuffer) continue;

      const processed = await preprocessImage(imageBuffer);
      const { data: { text } } = await ocrWorker.recognize(processed);

      const trimmed = text.trim();
      if (trimmed) {
        textParts.push(`--- Image ${i + 1} ---\n${trimmed}`);
      }
    } catch (error) {
      logger.warn(`OCR failed for image ${i + 1}: ${error.message}`);
    }
  }

  return textParts.join('\n\n');
};

/**
 * Assess OCR text quality. Returns a score from 0 to 1.
 * Low scores indicate the text is mostly gibberish (stylized flyers, decorative fonts).
 *
 * The check is deliberately aggressive — we'd rather spend a few cents on
 * Claude Vision than miss 18 events from a schedule flyer.
 *
 * @param {string} text - OCR extracted text
 * @param {number} imageCount - Number of images in the post
 * @returns {{ score: number, usable: boolean, reason: string }} quality assessment
 */
const assessOcrQuality = (text, imageCount = 1) => {
  if (!text || text.trim().length === 0) {
    return { score: 0, usable: false, reason: 'no_text' };
  }

  const cleaned = text.replace(/---\s*Image\s*\d+\s*---/g, '').trim();
  if (cleaned.length === 0) return { score: 0, usable: false, reason: 'no_text' };

  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);

  // 1. Junk word ratio — words that are 1-2 chars and mostly symbols
  const junkWords = words.filter((w) => {
    if (w.length > 3) return false;
    const alphaChars = (w.match(/[a-zA-Z]/g) || []).length;
    return alphaChars <= 1;
  });
  const junkRatio = words.length > 0 ? junkWords.length / words.length : 1;

  // 2. Real words — 3+ alpha characters (actual readable words)
  const realWords = words.filter((w) => (w.match(/[a-zA-Z]/g) || []).length >= 3);
  const realWordRatio = words.length > 0 ? realWords.length / words.length : 0;

  // 3. Date/time pattern check — crucial for event flyers
  //    If multiple images but we found almost no date/time info, OCR missed the key content
  const dateTimePatterns = /\b(\d{1,2}\/\d{1,2}|\d{1,2}:\d{2}|[1-9]\d?\s*(am|pm|AM|PM)|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/gi;
  const dateTimeMatches = (cleaned.match(dateTimePatterns) || []).length;

  // Score: emphasize real word ratio and penalize junk
  const score = Math.max(0, (realWordRatio * 0.6) - (junkRatio * 0.3) + 0.1);

  // Conditions that make OCR "not usable" (trigger vision fallback):
  // - More junk words than real words
  // - Multi-image post (likely a carousel/schedule) with almost no dates found
  // - Less than 40% real words
  let usable = true;
  let reason = 'ok';

  if (junkRatio > 0.4) {
    usable = false;
    reason = 'too_much_junk';
  } else if (realWordRatio < 0.4) {
    usable = false;
    reason = 'too_few_real_words';
  } else if (imageCount >= 3 && dateTimeMatches < 2) {
    usable = false;
    reason = 'multi_image_no_dates';
  }

  return { score: parseFloat(score.toFixed(3)), usable, reason };
};

/**
 * Download images and return them as base64-encoded strings for Claude Vision.
 * Used when OCR quality is too low and we need to send images directly.
 *
 * @param {string[]} imageUrls - Array of image URLs
 * @returns {Array<{ base64: string, mediaType: string }>} Downloaded images as base64
 */
const downloadImagesAsBase64 = async (imageUrls) => {
  const results = [];
  const urls = (imageUrls || []).slice(0, 5);

  for (const url of urls) {
    if (!url) continue;
    const buffer = await downloadImage(url);
    if (!buffer) continue;

    // Detect media type from first bytes
    let mediaType = 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) mediaType = 'image/png';
    else if (buffer[0] === 0x47 && buffer[1] === 0x49) mediaType = 'image/gif';
    else if (buffer[0] === 0x52 && buffer[1] === 0x49) mediaType = 'image/webp';

    results.push({
      base64: buffer.toString('base64'),
      mediaType,
    });
  }

  return results;
};

/**
 * Terminate the Tesseract worker (for graceful shutdown).
 */
const terminateWorker = async () => {
  if (worker) {
    await worker.terminate();
    worker = null;
    logger.info('Tesseract OCR worker terminated');
  }
};

module.exports = {
  extractTextFromImages,
  assessOcrQuality,
  downloadImagesAsBase64,
  terminateWorker,
};
