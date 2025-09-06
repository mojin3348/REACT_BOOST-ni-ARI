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
  if (!linkOrID) return null;

  if (/^\d+$/.test(linkOrID)) return linkOrID;

  let match = linkOrID.match(/\/posts\/(\d{8,})/);
  if (match) return match[1];

  match = linkOrID.match(/story_fbid=(\d{8,})/);
  if (match) return match[1];

  match = linkOrID.match(/[?&]id=(\d{8,})/);
  if (match) return match[1];

  match = linkOrID.match(/(\d{8,})/g);
  if (match) return match[match.length - 1];

  return null;
}

app.post("/boost", async (req, res) => {
  try {
    const { appstate, postLink, reactionType, limit } = req.body;

    console.log("🔎 Received postLink:", postLink);

    const cookies = getCookies(appstate);
    const postID = extractPostID(postLink);

    console.log("📌 Extracted postID:", postID);

    if (!postID) return res.status(400).json({ message: "❌ Invalid post link/ID." });

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

      console.log(`✅ Reacted #${i + 1} on post ${postID}`);

      const randomDelay = 1000 + Math.floor(Math.random() * 1000);
      await sleep(randomDelay);
    }

    res.json({ message: `✅ Reacted ${safeLimit} times with type ${reactionType} on post ${postID}` });
  } catch (err) {
    console.error("🔥 Error in /boost:", err);
    res.status(500).json({ message: "❌ Error boosting reaction." });
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
