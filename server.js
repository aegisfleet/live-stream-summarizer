const express = require('express');
const path = require('path');
const RateLimit = require('express-rate-limit');
const app = express();
const port = process.env.PORT || 3000;

// Set up rate limiter: maximum of 100 requests per 15 minutes for summaries.json
const summariesLimiter = RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

// Specific route for summaries.json to avoid any middleware issues
app.get('/data/summaries.json', summariesLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'src/data/summaries.json'));
});

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'src')));

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
