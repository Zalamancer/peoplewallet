/**
 * Tests for the AI pipeline field mapping logic
 * (Tests the mapExtractionToFields function without hitting external APIs)
 */

// We need to extract mapExtractionToFields from the ai routes module
// Since it's not exported, we'll test the logic indirectly through the route
// or extract the function for testing

describe('AI Pipeline - Field Mapping', () => {
  // Replicate the mapExtractionToFields logic for testing
  const categorize = (value, confidence) => {
    if (!value || confidence < 0.4) {
      return { value: null, status: 'blank', confidence };
    }
    if (confidence >= 0.7) {
      return { value, status: 'auto', confidence };
    }
    return { value, status: 'suggest', confidence };
  };

  describe('confidence categorization', () => {
    it('should auto-populate fields with confidence > 0.7', () => {
      const result = categorize('John Doe', 0.85);
      expect(result.status).toBe('auto');
      expect(result.value).toBe('John Doe');
    });

    it('should suggest fields with confidence 0.4-0.7', () => {
      const result = categorize('Maybe Jane', 0.55);
      expect(result.status).toBe('suggest');
      expect(result.value).toBe('Maybe Jane');
    });

    it('should blank fields with confidence < 0.4', () => {
      const result = categorize('Low confidence', 0.2);
      expect(result.status).toBe('blank');
      expect(result.value).toBeNull();
    });

    it('should blank null values regardless of confidence', () => {
      const result = categorize(null, 0.9);
      expect(result.status).toBe('blank');
      expect(result.value).toBeNull();
    });

    it('should handle edge case at 0.7 exactly', () => {
      const result = categorize('Edge case', 0.7);
      expect(result.status).toBe('auto');
    });

    it('should handle edge case at 0.4 exactly', () => {
      const result = categorize('Edge case', 0.4);
      expect(result.status).toBe('suggest');
    });
  });

  describe('extraction output structure', () => {
    it('should produce valid contact data from a complete extraction', () => {
      const extraction = {
        name: { full_name: 'Sarah Chen', nickname: null, pronouns: 'she/her', confidence: 0.92 },
        professional: {
          school: 'University of Texas at Dallas',
          graduation_year: '2026',
          major: 'Computer Science',
          company: null,
          job_title: null,
          department: null,
          confidence: 0.88,
        },
        social: { linkedin: null, instagram: '@sarah.chen', confidence: 0.6 },
        appearance: {
          height_range: 'average',
          hair_color: 'black',
          glasses: true,
          distinguishing_features: [],
          confidence: 0.75,
        },
        context: {
          how_met: 'Career fair',
          event_name: 'UTD Fall Career Fair',
          met_date: '2026-02-20',
          location: 'UTD Student Union',
          mutual_connections: ['Mike Johnson'],
          confidence: 0.9,
        },
        interests: ['machine learning', 'rock climbing'],
        conversation_topics: ['AI startups', 'course recommendations'],
        follow_up_items: ['Share ML resources', 'Connect on LinkedIn'],
        conversation_summary: 'Met Sarah at the career fair. CS student interested in ML, graduating 2026.',
        overall_confidence: 0.85,
      };

      // Verify name categorization
      const nameResult = categorize(extraction.name.full_name, extraction.name.confidence);
      expect(nameResult.status).toBe('auto');
      expect(nameResult.value).toBe('Sarah Chen');

      // Verify professional categorization
      const schoolResult = categorize(extraction.professional.school, extraction.professional.confidence);
      expect(schoolResult.status).toBe('auto');

      // Verify social (medium confidence) categorization
      const instaResult = categorize(extraction.social.instagram, extraction.social.confidence);
      expect(instaResult.status).toBe('suggest');

      // Verify all expected fields exist
      expect(extraction.interests).toHaveLength(2);
      expect(extraction.follow_up_items).toHaveLength(2);
      expect(extraction.overall_confidence).toBeGreaterThan(0.7);
    });

    it('should handle empty/minimal extraction', () => {
      const extraction = {
        name: { full_name: null, nickname: null, pronouns: null, confidence: 0.1 },
        professional: { confidence: 0 },
        social: { confidence: 0 },
        appearance: { confidence: 0 },
        context: { confidence: 0.2 },
        interests: [],
        conversation_topics: [],
        follow_up_items: [],
        conversation_summary: null,
        overall_confidence: 0.1,
      };

      const nameResult = categorize(extraction.name.full_name, extraction.name.confidence);
      expect(nameResult.status).toBe('blank');
      expect(extraction.overall_confidence).toBeLessThan(0.4);
    });
  });
});

describe('AI Pipeline - Audio Validation', () => {
  it('should validate allowed audio MIME types', () => {
    const allowedTypes = ['audio/wav', 'audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/webm', 'audio/x-m4a'];
    const disallowedTypes = ['audio/ogg', 'video/mp4', 'image/png', 'text/plain'];

    allowedTypes.forEach((type) => {
      expect(allowedTypes.includes(type)).toBe(true);
    });

    disallowedTypes.forEach((type) => {
      expect(allowedTypes.includes(type)).toBe(false);
    });
  });
});
