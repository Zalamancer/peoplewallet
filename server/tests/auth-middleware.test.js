/**
 * Tests for authentication middleware
 */

const jwt = require('jsonwebtoken');

// Mock dependencies before requiring the module
jest.mock('../src/config/firebase', () => ({
  verifyFirebaseToken: jest.fn().mockRejectedValue(new Error('Not a Firebase token')),
}));

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const { authenticate, contactRateLimit, requirePro } = require('../src/middleware/auth');
const { query } = require('../src/config/database');

describe('authenticate middleware', () => {
  const JWT_SECRET = 'test-jwt-secret';
  let mockReq, mockRes, mockNext;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = { headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  it('should reject request without auth header', async () => {
    await authenticate(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'No authentication token provided' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should reject request with invalid Bearer format', async () => {
    mockReq.headers.authorization = 'InvalidFormat token123';
    await authenticate(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should authenticate valid JWT token', async () => {
    const userId = 'test-user-id';
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
    mockReq.headers.authorization = `Bearer ${token}`;

    const mockUser = {
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
      subscription_tier: 'free',
      daily_contact_count: 0,
      daily_contact_reset_at: new Date(),
    };

    query.mockResolvedValue({ rows: [mockUser] });

    await authenticate(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(mockReq.user).toEqual(mockUser);
  });

  it('should reject expired JWT token', async () => {
    const token = jwt.sign({ userId: 'test' }, JWT_SECRET, { expiresIn: '-1h' });
    mockReq.headers.authorization = `Bearer ${token}`;

    await authenticate(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  it('should reject when user not found in database', async () => {
    const token = jwt.sign({ userId: 'nonexistent' }, JWT_SECRET);
    mockReq.headers.authorization = `Bearer ${token}`;

    query.mockResolvedValue({ rows: [] });

    await authenticate(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not found' });
  });
});

describe('contactRateLimit middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      user: {
        id: 'test-user-id',
        daily_contact_count: 0,
        daily_contact_reset_at: new Date(),
      },
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  it('should allow contact creation under limit', async () => {
    mockReq.user.daily_contact_count = 5;
    await contactRateLimit(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should block contact creation at limit', async () => {
    mockReq.user.daily_contact_count = 10;
    await contactRateLimit(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Daily contact creation limit reached (10/day)' })
    );
  });

  it('should reset counter after 24 hours', async () => {
    mockReq.user.daily_contact_count = 10;
    mockReq.user.daily_contact_reset_at = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

    query.mockResolvedValue({ rows: [] });

    await contactRateLimit(mockReq, mockRes, mockNext);
    expect(query).toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });
});

describe('requirePro middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = { user: { subscription_tier: 'free' } };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  it('should allow all users through during beta', () => {
    requirePro(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
