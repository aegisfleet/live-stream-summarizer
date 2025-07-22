const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'src')));

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
