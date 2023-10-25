import express from 'express';
import bodyParser from 'body-parser';
import { run } from './lib/dev.js'; // Assuming the main module is named 'main.js'
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;

app.use(bodyParser.json());


app.post('/api', (req, res) => {
  run(req.body.settings, req.body.context);
  res.json({ message: 'ok' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


