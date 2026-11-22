/**
 * test/logger.test.js
 * Comprehensive tests for express-easy-logger using Node's built-in test runner.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');

const logger = require('../index');
const {
  getTimestamp,
  getStatusColor,
  sanitizeBody,
  formatLog,
  COLORS,
} = require('../src/formatter');
const { writeLog, parseLogLine, readLastLogs } = require('../src/fileWriter');

const TEST_LOG_DIR = path.join(__dirname, 'tmp_logs');
const TEST_LOG_FILE = path.join(TEST_LOG_DIR, 'test.log');

describe('express-easy-logger test suite', () => {
  before(() => {
    // Ensure clean state before tests
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  });

  after(() => {
    // Clean up temporary test files
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  });

  describe('1. Formatter and Colors', () => {
    it('should format timestamp as YYYY-MM-DD HH:mm:ss', () => {
      const fixedDate = new Date(2026, 10, 22, 10, 30, 15); // Month is 0-indexed (10 = November)
      const ts = getTimestamp(fixedDate);
      assert.equal(ts, '2026-11-22 10:30:15');
    });

    it('should assign correct ANSI color codes by HTTP status range', () => {
      // 2xx -> Green
      assert.equal(getStatusColor(200), COLORS.green);
      assert.equal(getStatusColor(201), COLORS.green);

      // 3xx -> Cyan
      assert.equal(getStatusColor(301), COLORS.cyan);
      assert.equal(getStatusColor(302), COLORS.cyan);

      // 4xx -> Yellow
      assert.equal(getStatusColor(400), COLORS.yellow);
      assert.equal(getStatusColor(404), COLORS.yellow);

      // 5xx -> Red
      assert.equal(getStatusColor(500), COLORS.red);
      assert.equal(getStatusColor(503), COLORS.red);
    });

    it('should format simple log string with colors and plain output for file', () => {
      const info = {
        timestamp: '2026-11-22 10:30:15',
        method: 'GET',
        url: '/users',
        status: 200,
        duration: 12,
      };

      const result = formatLog(info, { colors: true, format: 'simple' });
      assert.ok(result.consoleOutput.includes(COLORS.green));
      assert.ok(result.consoleOutput.includes('200'));
      assert.ok(result.consoleOutput.includes('12ms'));

      // fileOutput must NOT have ANSI color codes
      assert.equal(result.fileOutput, '[2026-11-22 10:30:15] GET /users 200 12ms');
    });

    it('should format logs as JSON when format is "json"', () => {
      const info = {
        timestamp: '2026-11-22 10:30:15',
        method: 'POST',
        url: '/items',
        status: 201,
        duration: 8,
      };

      const result = formatLog(info, { format: 'json' });
      const parsed = JSON.parse(result.fileOutput);
      assert.equal(parsed.method, 'POST');
      assert.equal(parsed.status, 201);
      assert.equal(parsed.duration, '8ms');
    });
  });

  describe('2. Sensitive Body Data Sanitization', () => {
    it('should mask sensitive keys: password, token, authorization', () => {
      const body = {
        username: 'student123',
        password: 'mySuperSecretPassword',
        token: 'jwt.token.here',
        authorization: 'Bearer 12345',
        age: 20,
      };

      const sanitized = sanitizeBody(body);
      assert.equal(sanitized.username, 'student123');
      assert.equal(sanitized.password, '***');
      assert.equal(sanitized.token, '***');
      assert.equal(sanitized.authorization, '***');
      assert.equal(sanitized.age, 20);
    });

    it('should mask sensitive keys inside nested objects and arrays', () => {
      const nested = {
        user: {
          email: 'test@example.com',
          password: 'secretPassword',
        },
        tokens: [{ token: 'abc' }, { token: 'xyz' }],
      };

      const sanitized = sanitizeBody(nested);
      assert.equal(sanitized.user.email, 'test@example.com');
      assert.equal(sanitized.user.password, '***');
      assert.equal(sanitized.tokens[0].token, '***');
      assert.equal(sanitized.tokens[1].token, '***');
    });
  });

  describe('3. File Writer and Log Reader', () => {
    it('should create directories recursively and write log lines', () => {
      writeLog(TEST_LOG_FILE, '[2026-11-22 10:00:00] GET /first 200 5ms');
      writeLog(TEST_LOG_FILE, '[2026-11-22 10:00:01] POST /second 404 10ms');

      assert.ok(fs.existsSync(TEST_LOG_FILE));
      const content = fs.readFileSync(TEST_LOG_FILE, 'utf8');
      assert.ok(content.includes('GET /first 200 5ms'));
      assert.ok(content.includes('POST /second 404 10ms'));
    });

    it('should read the last logs newest first', () => {
      const logs = readLastLogs(TEST_LOG_FILE, 10);
      assert.equal(logs.length, 2);
      // Newest should be first
      assert.equal(logs[0].method, 'POST');
      assert.equal(logs[0].status, 404);
      assert.equal(logs[1].method, 'GET');
      assert.equal(logs[1].status, 200);
    });

    it('should return empty array for non-existent files without throwing', () => {
      const logs = readLastLogs('/non/existent/path/never_created.log');
      assert.deepEqual(logs, []);
    });
  });

  describe('4. Express Logger Middleware Execution', () => {
    it('should call next() and log upon response completion', (t, done) => {
      const logs = [];
      const originalConsoleLog = console.log;
      console.log = (msg) => logs.push(msg);

      const middleware = logger({ colors: false });

      // Mock request and response
      const req = { method: 'GET', url: '/api/test', originalUrl: '/api/test' };
      const listeners = {};
      const res = {
        statusCode: 200,
        on: (event, handler) => { listeners[event] = handler; },
      };

      middleware(req, res, () => {
        // Trigger finish event
        listeners['finish']();

        console.log = originalConsoleLog; // restore
        assert.equal(logs.length, 1);
        assert.ok(logs[0].includes('GET /api/test 200'));
        done();
      });
    });

    it('should skip logging for URLs specified in options.skip', (t, done) => {
      const logs = [];
      const originalConsoleLog = console.log;
      console.log = (msg) => logs.push(msg);

      const middleware = logger({ skip: ['/favicon.ico', /^\/health/] });

      const req = { method: 'GET', url: '/favicon.ico', originalUrl: '/favicon.ico' };
      const res = { on: () => {} };

      middleware(req, res, () => {
        console.log = originalConsoleLog;
        assert.equal(logs.length, 0); // Nothing logged
        done();
      });
    });
  });

  describe('5. Built-in Log Viewer Middleware', () => {
    it('should serve HTML dashboard with table and headers', (t, done) => {
      const viewerMiddleware = logger.viewer({ file: TEST_LOG_FILE });
      const req = {
        url: '/',
        baseUrl: '/logs',
        originalUrl: '/logs',
        query: {},
        headers: {},
      };

      const res = {
        setHeader: (k, v) => {},
        end: (html) => {
          assert.ok(html.includes('<!DOCTYPE html>'));
          assert.ok(html.includes('Express Easy Logger'));
          assert.ok(html.includes('table'));
          done();
        },
      };

      viewerMiddleware(req, res, () => {});
    });

    it('should serve JSON logs when format=json query parameter is present', (t, done) => {
      const viewerMiddleware = logger.viewer({ file: TEST_LOG_FILE });
      const req = {
        url: '/?format=json',
        baseUrl: '/logs',
        originalUrl: '/logs?format=json',
        query: { format: 'json' },
        headers: {},
      };

      let contentType = '';
      const res = {
        setHeader: (k, v) => {
          if (k.toLowerCase() === 'content-type') contentType = v;
        },
        end: (payload) => {
          assert.equal(contentType, 'application/json');
          const data = JSON.parse(payload);
          assert.ok(Array.isArray(data.logs));
          assert.equal(data.logs.length, 2);
          done();
        },
      };

      viewerMiddleware(req, res, () => {});
    });
  });

  describe('6. Error Resilience (Never Crash Rule)', () => {
    it('should not throw or crash if file writer encounters bad path', () => {
      assert.doesNotThrow(() => {
        writeLog('\0badpath', 'test log');
      });
    });

    it('should not throw if request objects are malformed', (t, done) => {
      const middleware = logger();
      const req = null; // edge case: malformed req
      const res = null;

      assert.doesNotThrow(() => {
        middleware(req, res, () => {
          done();
        });
      });
    });
  });
});
