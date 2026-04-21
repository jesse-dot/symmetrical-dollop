const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'localhost';
const OLLAMA_PORT = process.env.OLLAMA_PORT || 11434;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// List available models from Ollama
app.get('/api/models', (req, res) => {
  const options = {
    hostname: OLLAMA_HOST,
    port: OLLAMA_PORT,
    path: '/api/tags',
    method: 'GET',
  };

  const request = http.request(options, (ollamaRes) => {
    let data = '';
    ollamaRes.on('data', (chunk) => { data += chunk; });
    ollamaRes.on('end', () => {
      try {
        res.json(JSON.parse(data));
      } catch {
        res.status(500).json({ error: 'Failed to parse Ollama response' });
      }
    });
  });

  request.on('error', (err) => {
    res.status(502).json({ error: `Cannot reach Ollama: ${err.message}` });
  });

  request.end();
});

// Stream a chat completion from Ollama
app.post('/api/chat', (req, res) => {
  const { model, messages } = req.body;
  if (!model || !messages) {
    return res.status(400).json({ error: 'model and messages are required' });
  }

  const body = JSON.stringify({ model, messages, stream: true });

  const options = {
    hostname: OLLAMA_HOST,
    port: OLLAMA_PORT,
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const request = http.request(options, (ollamaRes) => {
    let finished = false;

    ollamaRes.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const token = parsed?.message?.content ?? '';
          const done = parsed?.done ?? false;
          res.write(`data: ${JSON.stringify({ token, done })}\n\n`);
          if (done) finished = true;
        } catch {
          // skip malformed lines
        }
      }
    });

    ollamaRes.on('end', () => {
      if (!finished) {
        res.write(`data: ${JSON.stringify({ token: '', done: true })}\n\n`);
      }
      res.end();
    });
  });

  request.on('error', (err) => {
    res.write(`data: ${JSON.stringify({ error: err.message, done: true })}\n\n`);
    res.end();
  });

  request.write(body);
  request.end();
});

app.listen(PORT, () => {
  console.log(`Ollama chat server running at http://localhost:${PORT}`);
  console.log(`Expecting Ollama at http://${OLLAMA_HOST}:${OLLAMA_PORT}`);
});
