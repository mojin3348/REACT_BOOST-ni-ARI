import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

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

const reactionMap = {
  like: 1,
  love: 2,
  wow: 3,
  haha: 4,
  sad: 7,
  angry: 8
};

app.post("/boost", async (req, res) => {
  try {
    const { appstate, postLink, reactionType, limit } = req.body;
    const cookies = getCookies(appstate);
    const postID = extractPostID(postLink);

    if (!postID) return res.status(400).json({ message: "❌ Invalid post link/ID." });

    const home = await fetch("https://mbasic.facebook.com/", {
      headers: { "Cookie": cookies, "User-Agent": "Mozilla/5.0" }
    });
    const html = await home.text();
    const fb_dtsg = html.match(/name="fb_dtsg" value="(.*?)"/)?.[1];
    const jazoest = html.match(/name="jazoest" value="(.*?)"/)?.[1];

    if (!fb_dtsg || !jazoest) {
      return res.status(400).json({ message: "❌ Failed to fetch fb_dtsg or jazoest." });
    }

    const maxLimit = 100;
    const safeLimit = Math.min(Number(limit), maxLimit);

    const reactCode = reactionMap[reactionType.toLowerCase()] || 1; // default like

    for (let i = 0; i < safeLimit; i++) {
      const r = await fetch(`https://mbasic.facebook.com/ufi/reaction/?ft_ent_identifier=${postID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": cookies,
          "User-Agent": "Mozilla/5.0"
        },
        body: `fb_dtsg=${fb_dtsg}&jazoest=${jazoest}&reaction_type=${reactCode}&ft_ent_identifier=${postID}`
      });

      console.log(`Reacted #${i + 1} with ${reactionType} on post ${postID}, status=${r.status}`);
      await sleep(1000 + Math.floor(Math.random() * 1000)); // 1–2s delay
    }

    res.json({ message: `✅ Reacted ${safeLimit} times with ${reactionType} on post ${postID}` });
  } catch (err) {
    console.error("Boost error:", err);
    res.status(500).json({ message: "❌ Error boosting reaction." });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
