const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const total = new Map();

app.get("/total", (req, res) => {
  const data = Array.from(total.values()).map((link, index) => ({
    session: index + 1,
    url: link.url,
    count: link.count,
    id: link.id,
    target: link.target,
    type: link.type,
  }));
  res.json(data || []);
});

// Serve HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/submit", async (req, res) => {
  const { cookie, url, amount, interval, reactionType } = req.body;
  if (!cookie || !url || !amount || !interval || !reactionType)
    return res
      .status(400)
      .json({ error: "Missing cookie, url, amount, interval or reactionType" });

  try {
    const cookies = await convertCookie(cookie);
    if (!cookies) {
      return res.status(400).json({ status: 500, error: "Invalid cookies" });
    }

    await react(cookies, url, amount, interval, reactionType);
    res.status(200).json({ status: 200 });
  } catch (err) {
    return res
      .status(500)
      .json({ status: 500, error: err.message || err.toString() });
  }
});

async function react(cookies, url, amount, interval, reactionType) {
  const id = extractPostID(url);
  if (!id)
    throw new Error("❌ Unable to extract post ID. Check URL format or post privacy.");

  const postId = total.has(id) ? id + 1 : id;
  total.set(postId, { url, id, count: 0, target: amount, type: reactionType });

  let reactedCount = 0;
  let timer;

  async function reactOnce() {
    try {
      const { fb_dtsg, jazoest } = await getTokens(cookies);

      const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: cookies,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        origin: "https://mbasic.facebook.com",
        referer: `https://mbasic.facebook.com/${id}`,
      };

      const body = `fb_dtsg=${encodeURIComponent(
        fb_dtsg
      )}&jazoest=${encodeURIComponent(
        jazoest
      )}&reaction_type=${reactionType}&ft_ent_identifier=${id}`;

      const response = await axios.post(
        `https://mbasic.facebook.com/ufi/reaction/?ft_ent_identifier=${id}`,
        body,
        { headers }
      );

      if (response.status === 200) {
        total.set(postId, {
          ...total.get(postId),
          count: total.get(postId).count + 1,
        });
        reactedCount++;
        console.log(`✅ Reacted #${reactedCount} on post ${id}`);
      }

      if (reactedCount === amount) clearInterval(timer);
    } catch (error) {
      console.error("❌ Failed to react:", error.message);
      clearInterval(timer);
      total.delete(postId);
    }
  }

  timer = setInterval(reactOnce, interval * 1000);

  // Safety auto-stop
  setTimeout(() => {
    clearInterval(timer);
    total.delete(postId);
  }, amount * interval * 1000);
}

// Extract post ID directly from link
function extractPostID(url) {
  const regex = url.match(
    /(?:story_fbid|fbid)=(\d+)|\/posts\/(\d+)|pfbid([A-Za-z0-9]+)/
  );
  return regex ? regex[1] || regex[2] || regex[3] : null;
}

// Scrape fb_dtsg + jazoest tokens
async function getTokens(cookies) {
  const res = await axios.get("https://mbasic.facebook.com/", {
    headers: { cookie: cookies, "user-agent": "Mozilla/5.0" },
  });
  const html = res.data;
  const fb_dtsg = (html.match(/name="fb_dtsg" value="([^"]+)"/) || [])[1];
  const jazoest = (html.match(/name="jazoest" value="([^"]+)"/) || [])[1];
  if (!fb_dtsg || !jazoest)
    throw new Error("Failed to extract fb_dtsg/jazoest tokens");
  return { fb_dtsg, jazoest };
}

async function convertCookie(cookie) {
  return new Promise((resolve, reject) => {
    try {
      const cookies = JSON.parse(cookie);
      const sbCookie = cookies.find((c) => c.key === "sb");
      if (!sbCookie) reject("Invalid appstate");
      const data = cookies.map((c) => `${c.key}=${c.value}`).join("; ");
      resolve(data);
    } catch (error) {
      reject("Error processing appstate");
    }
  });
}

app.listen(5000, () =>
  console.log("🚀 ReactBoost server running on http://localhost:5000")
);
