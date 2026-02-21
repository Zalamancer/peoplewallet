/**
 * Tests for validation middleware
 * Tests content filter and validation rules
 */

describe('Content Filter', () => {
  // Import the content filter directly for unit testing
  const { contentFilter } = require('../src/middleware/validation');

  const mockNext = jest.fn();
  const mockRes = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass through when no notes are present', () => {
    const req = { body: {} };
    contentFilter(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should pass through for normal notes', () => {
    const req = {
      body: {
        notes: [{ content: 'Met at the career fair, seems interested in AI' }],
      },
    };
    contentFilter(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should block notes containing health information', () => {
    const req = {
      body: {
        notes: [{ content: 'She mentioned her diagnosis with something' }],
      },
    };
    contentFilter(req, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Content policy violation' })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should block notes containing political information', () => {
    const req = {
      body: {
        notes: [{ content: 'He voted for the Republican candidate' }],
      },
    };
    contentFilter(req, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should block notes containing racial information', () => {
    const req = {
      body: {
        notes: [{ content: 'Her ethnicity is interesting' }],
      },
    };
    contentFilter(req, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should block notes containing religious information', () => {
    const req = {
      body: {
        notes: [{ content: 'Very religious person, goes to church' }],
      },
    };
    contentFilter(req, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should allow notes that mention similar words in different context', () => {
    const req = {
      body: {
        notes: [{ content: 'Works at a pharmaceutical company' }],
      },
    };
    contentFilter(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should check all notes in the array', () => {
    const req = {
      body: {
        notes: [
          { content: 'Normal note about career interests' },
          { content: 'Takes some medication regularly' },
        ],
      },
    };
    contentFilter(req, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
