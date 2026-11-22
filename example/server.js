/**
 * example/server.js
 * A runnable Express app demonstrating all features of express-easy-logger.
 */

const express = require('express');
const path = require('path');
const logger = require('../index'); // In your own project, this would be: require('express-easy-logger')

const app = express();
const PORT = process.env.PORT || 3000;
const logFilePath = path.join(__dirname, 'logs', 'example.log');

// 1. Parse incoming JSON and form request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Attach express-easy-logger middleware
// Logs every request to the terminal (with colors) and appends to example.log
app.use(
  logger({
    colors: true,
    file: logFilePath,
    showBody: true, // Automatically masks password, token, authorization
    skip: ['/favicon.ico'], // Don't clutter logs with favicon requests
  })
);

// 3. Attach the built-in HTML Log Viewer at /logs
app.use(
  '/logs',
  logger.viewer({
    file: logFilePath,
  })
);

// --- Demo Routes ---

// Home route (200 OK) with links to test different status codes
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>express-easy-logger Demo</title>
        <style>
          body { font-family: sans-serif; max-width: 600px; margin: 40px auto; line-height: 1.6; }
          a { color: #0284c7; text-decoration: none; font-weight: 500; }
          a:hover { text-decoration: underline; }
          li { margin-bottom: 8px; }
          .card { background: #f1f5f9; padding: 16px; border-radius: 8px; margin-top: 20px; }
          code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; }
          button { background: #0284c7; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>🚀 express-easy-logger Demo</h1>
        <p>Click these links to trigger requests and view them in your terminal and log viewer:</p>
        <ul>
          <li><a href="/users">GET /users (200 OK - Green)</a></li>
          <li><a href="/redirect">GET /redirect (302 Redirect - Cyan)</a></li>
          <li><a href="/page-not-found">GET /page-not-found (404 Not Found - Yellow)</a></li>
          <li><a href="/error">GET /error (500 Server Error - Red)</a></li>
          <li><a href="/slow">GET /slow (Simulates a 250ms delayed request)</a></li>
        </ul>

        <div class="card">
          <h3>Test Sensitive Body Masking (POST /login)</h3>
          <p>Sends username and a hidden password:</p>
          <button onclick="fetch('/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username: 'alice', password: 'secretPassword123!', token: 'abc-xyz' })
          }).then(r => r.json()).then(d => alert('Response: ' + JSON.stringify(d)))">
            Send POST /login request
          </button>
        </div>

        <div class="card" style="background: #e0f2fe;">
          <h3>📊 Real-Time Web Log Viewer</h3>
          <p>Open the live log dashboard: <a href="/logs" target="_blank"><strong>http://localhost:${PORT}/logs</strong></a></p>
        </div>
      </body>
    </html>
  `);
});

// 200 OK route (Green)
app.get('/users', (req, res) => {
  res.json([
    { id: 1, name: 'Alex' },
    { id: 2, name: 'Taylor' },
  ]);
});

// 302 Found / Redirect route (Cyan)
app.get('/redirect', (req, res) => {
  res.redirect('/users');
});

// Slow route to demonstrate response time calculation
app.get('/slow', (req, res) => {
  setTimeout(() => {
    res.json({ message: 'This response took about 250ms' });
  }, 250);
});

// POST route with body (demonstrates masking password and token)
app.post('/login', (req, res) => {
  res.json({
    message: 'Login received! Notice how password was masked in the console and log file.',
    user: req.body.username || 'guest',
  });
});

// 500 Internal Server Error route (Red)
app.get('/error', (req, res) => {
  res.status(500).json({ error: 'Something went wrong on the server!' });
});

// 404 Not Found route for any undefined path (Yellow)
app.use((req, res) => {
  res.status(404).send('404 Page Not Found');
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` express-easy-logger demo app is running!`);
  console.log(` ➜ Demo home:   http://localhost:${PORT}`);
  console.log(` ➜ Log viewer:  http://localhost:${PORT}/logs`);
  console.log(` ➜ Log file:    ${logFilePath}`);
  console.log(`======================================================\n`);
});

module.exports = { app, server };
