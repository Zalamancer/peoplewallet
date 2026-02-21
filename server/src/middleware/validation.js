const { body, param, query: queryParam, validationResult } = require('express-validator');

/**
 * Handle validation errors
 */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map((e) => ({
        field: e.path,
        message: e.msg,
      })),
    });
  }
  next();
};

/**
 * Contact creation validation rules
 */
const validateCreateContact = [
  body('full_name')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ max: 255 })
    .withMessage('Full name must be under 255 characters'),
  body('nickname')
    .optional()
    .trim()
    .isLength({ max: 100 }),
  body('pronouns')
    .optional()
    .trim()
    .isLength({ max: 50 }),
  body('source')
    .optional()
    .isIn(['manual', 'dictation', 'recording', 'linkedin', 'instagram']),
  // Professional fields
  body('professional.school').optional().trim().isLength({ max: 255 }),
  body('professional.graduation_year').optional().trim().isLength({ max: 10 }),
  body('professional.major').optional().trim().isLength({ max: 255 }),
  body('professional.company').optional().trim().isLength({ max: 255 }),
  body('professional.job_title').optional().trim().isLength({ max: 255 }),
  body('professional.department').optional().trim().isLength({ max: 255 }),
  // Social links
  body('social').optional().isArray(),
  body('social.*.platform')
    .optional()
    .isIn(['linkedin', 'instagram', 'twitter', 'github', 'website', 'other']),
  body('social.*.handle').optional().trim().isLength({ max: 255 }),
  body('social.*.url').optional().trim().isURL().withMessage('Invalid URL'),
  // Appearance (structured tags only)
  body('appearance.height_range')
    .optional()
    .isIn(['short', 'average', 'tall', 'very_tall']),
  body('appearance.hair_color')
    .optional()
    .isIn(['black', 'brown', 'blonde', 'red', 'gray', 'white', 'other', 'none']),
  body('appearance.glasses').optional().isBoolean(),
  body('appearance.distinguishing_features').optional().isArray(),
  // Context
  body('context.how_met').optional().trim().isLength({ max: 255 }),
  body('context.event_name').optional().trim().isLength({ max: 255 }),
  body('context.met_date').optional().isISO8601(),
  body('context.location').optional().trim().isLength({ max: 255 }),
  body('context.mutual_connections').optional().isArray(),
  // Notes
  body('notes').optional().isArray(),
  body('notes.*.content').optional().trim().notEmpty(),
  body('notes.*.source')
    .optional()
    .isIn(['manual', 'dictation', 'recording', 'ai_generated']),
  // Tags
  body('tags').optional().isArray(),
  body('tags.*').optional().trim().isLength({ max: 100 }),
  handleValidation,
];

/**
 * Contact update validation
 */
const validateUpdateContact = [
  param('id').isUUID().withMessage('Invalid contact ID'),
  body('full_name').optional().trim().notEmpty().isLength({ max: 255 }),
  body('nickname').optional().trim().isLength({ max: 100 }),
  body('pronouns').optional().trim().isLength({ max: 50 }),
  body('is_favorite').optional().isBoolean(),
  handleValidation,
];

/**
 * UUID parameter validation
 */
const validateUUID = [
  param('id').isUUID().withMessage('Invalid ID format'),
  handleValidation,
];

/**
 * Transcription validation
 */
const validateTranscription = [
  body('audio_base64')
    .optional()
    .isString()
    .withMessage('Audio must be base64 encoded string'),
  body('raw_text')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Transcription text is required if no audio provided'),
  handleValidation,
];

/**
 * Content filter for sensitive data in notes
 * Flags health, political, racial, religious, sexual orientation info
 */
const contentFilter = (req, res, next) => {
  const sensitivePatterns = [
    /\b(disease|diagnosis|medication|prescription|symptom|mental health|disability)\b/i,
    /\b(republican|democrat|liberal|conservative|political party|voted for)\b/i,
    /\b(race|ethnicity|racial)\b/i,
    /\b(religion|religious|muslim|christian|jewish|hindu|buddhist|atheist)\b/i,
    /\b(sexual orientation|gay|lesbian|bisexual|transgender)\b/i,
  ];

  const checkText = (text) => {
    if (!text) return false;
    return sensitivePatterns.some((pattern) => pattern.test(text));
  };

  // Check notes content
  if (req.body.notes) {
    for (const note of req.body.notes) {
      if (checkText(note.content)) {
        return res.status(400).json({
          error: 'Content policy violation',
          message:
            'Notes may not contain sensitive personal information about health, political affiliation, race, religion, or sexual orientation. Please remove this information and try again.',
        });
      }
    }
  }

  next();
};

module.exports = {
  validateCreateContact,
  validateUpdateContact,
  validateUUID,
  validateTranscription,
  contentFilter,
  handleValidation,
};
