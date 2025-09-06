import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = 3000;

app.use(express.static("public"));
app.use(express.json({ limit: "2mb" }));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getCookies(appstate) {
  const parsed = JSON.parse(appstate);
  return parsed.map(c => `${c.key}=${c.value}`).join("; ");
}

function extractPostID(linkOrID) {
  if (/^\d+$/.test(linkOrID)) return linkOrID;
  const match = linkOrID.match(/\/posts\/(\d+)/) || linkOrID.match(/story_fbid=(\d+)/);
  return match ? match[1] : null;
}

app.post("/boost", async (req, res) => {
  try {
    const { appstate, postLink, reactionType, limit } = req.body;
    const cookies = getCookies(appstate);
    const postID = extractPostID(postLink);

    if (!postID) return res.json({ message: "❌ Invalid post link/ID." });

    const maxLimit = 100;
    const safeLimit = Math.min(Number(limit), maxLimit);

    for (let i = 0; i < safeLimit; i++) {
      await fetch("https://www.facebook.com/ufi/reaction/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": cookies,
          "User-Agent": "Mozilla/5.0"
        },
        body: `ft_ent_identifier=${postID}&reaction_type=${reactionType}`
      });

      console.log(`Reacted #${i + 1} on post ${postID}`);

      const randomDelay = 1000 + Math.floor(Math.random() * 1000);
      await sleep(randomDelay);
    }

    res.json({ message: `✅ Reacted ${safeLimit} times with type ${reactionType} on post ${postID}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "❌ Error boosting reaction." });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
