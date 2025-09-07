const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/boost', async (req, res) => {
  const { appstate, postLink, reactionType, limit } = req.body;
  if (!appstate || !postLink || !reactionType || !limit) {
    return res.status(400).json({ message: "❌ Missing required fields" });
  }

  try {
    const cookies = await convertCookie(appstate);
    const postId = await getPostID(postLink);
    if (!postId) throw new Error("Invalid post link or private post.");

    let successCount = 0;

    for (let i = 0; i < limit; i++) {
      const success = await sendReaction(cookies, postId, reactionType);
      if (success) successCount++;
      await new Promise(r => setTimeout(r, 1500)); 
    }

    res.json({ message: `✅ Sent ${successCount}/${limit} reactions` });

  } catch (err) {
    res.status(500).json({ message: err.message || "❌ Failed to send reactions" });
  }
});

async function convertCookie(cookie) {
  const cookies = JSON.parse(cookie);
  return cookies.map(c => `${c.key}=${c.value}`).join("; ");
}

async function getPostID(url) {
  const match = url.match(/(\d{8,})/);
  return match ? match[1] : null;
}

async function sendReaction(cookies, postId, reactionType) {
  try {
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      "cookie": cookies,
      "user-agent": "Mozilla/5.0"
    };

    const res = await axios.post(
      `https://mbasic.facebook.com/ufi/reaction/?ft_ent_identifier=${postId}`,
      `reaction_type=${reactionType}`,
      { headers }
    );

    return res.status === 200;
  } catch (e) {
    console.error("React failed:", e.message);
    return false;
  }
}

app.listen(5000, () => console.log("🚀 ReactBoost running at http://localhost:5000"));
