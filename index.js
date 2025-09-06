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
  try {
    const parsed = JSON.parse(appstate);
    if (!Array.isArray(parsed)) throw new Error("Appstate is not an array.");
    return parsed.map(c => `${c.key}=${c.value}`).join("; ");
  } catch (err) {
    throw new Error("❌ Invalid Appstate JSON format.");
  }
}

function extractPostID(linkOrID) {
  if (/^\d+$/.test(linkOrID)) return linkOrID;
  const match = linkOrID.match(/\/posts\/(\d+)/) || linkOrID.match(/story_fbid=(\d+)/);
  return match ? match[1] : null;
}

async function getTokens(cookies) {
  const res = await fetch("https://mbasic.facebook.com/", {
    headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" }
  });

  if (res.status !== 200) throw new Error("❌ Failed to load Facebook. Maybe cookies are invalid.");

  const html = await res.text();

  const fb_dtsg = (html.match(/name="fb_dtsg" value="([^"]+)"/) || [])[1];
  const jazoest = (html.match(/name="jazoest" value="([^"]+)"/) || [])[1];

  if (!fb_dtsg || !jazoest) {
    throw new Error("❌ Failed to extract fb_dtsg/jazoest. Account might be checkpointed or cookies expired.");
  }

  return { fb_dtsg, jazoest };
}

app.post("/boost", async (req, res) => {
  try {
    const { appstate, postLink, reactionType, limit } = req.body;
    const cookies = getCookies(appstate);
    const postID = extractPostID(postLink);

    if (!postID) {
      return res.status(400).json({ message: "❌ Invalid post link/ID." });
    }

    const maxLimit = 100;
    const safeLimit = Math.min(Number(limit), maxLimit);

    let fb_dtsg, jazoest;
    try {
      ({ fb_dtsg, jazoest } = await getTokens(cookies));
    } catch (err) {
      console.error(err.message);
      return res.status(401).json({ message: err.message });
    }

    let successCount = 0;

    for (let i = 0; i < safeLimit; i++) {
      const response = await fetch("https://mbasic.facebook.com/ufi/reaction/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": cookies,
          "User-Agent": "Mozilla/5.0"
        },
        body: `fb_dtsg=${encodeURIComponent(fb_dtsg)}&jazoest=${encodeURIComponent(jazoest)}&reaction_type=${reactionType}&ft_ent_identifier=${postID}`
      });

      const text = await response.text();

      if (response.status === 200 && !text.includes("login")) {
        successCount++;
        console.log(`✅ Reacted #${i + 1} on post ${postID}`);
      } else {
        console.log(`❌ Failed react #${i + 1}, status: ${response.status}`);
      }

      const randomDelay = 1000 + Math.floor(Math.random() * 1000);
      await sleep(randomDelay);
    }

    res.json({ message: `Boost finished. Success: ${successCount}/${safeLimit}` });
  } catch (err) {
    console.error("❌ Unexpected error:", err);
    res.status(500).json({ message: "❌ Error boosting reaction." });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
