const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Specific route for summaries.json to avoid any middleware issues
app.get('/data/summaries.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/data/summaries.json'));
});

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'src')));

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
