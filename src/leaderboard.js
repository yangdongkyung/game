const FIREBASE_SDK_VERSION = "10.12.5";
const LOCAL_KEY = "flux-relay-scores";

const requiredConfigKeys = ["apiKey", "projectId", "appId", "databaseURL"];

const cleanEntry = (entry) => ({
  name: String(entry.name || "Pilot").trim().slice(0, 18) || "Pilot",
  score: Math.max(0, Math.min(999999, Math.round(Number(entry.score) || 0))),
  difficulty: ["chill", "standard", "chaos"].includes(entry.difficulty) ? entry.difficulty : "standard",
  maxCombo: Math.max(1, Math.min(99, Math.round(Number(entry.maxCombo) || 1))),
  delivered: Math.max(0, Math.min(999, Math.round(Number(entry.delivered) || 0)))
});

const hasFirebaseConfig = (config) =>
  requiredConfigKeys.every((key) => typeof config?.[key] === "string" && config[key].trim().length > 0);

export class Leaderboard {
  constructor({ listEl, statusEl }) {
    this.listEl = listEl;
    this.statusEl = statusEl;
    this.mode = "local";
    this.scoresPath = window.__GAME_SCORES_PATH__ || "scores";
    this.firebase = null;
    this.db = null;
    this.scores = [];
  }

  async init() {
    const config = window.__FIREBASE_CONFIG__ || {};

    if (hasFirebaseConfig(config)) {
      try {
        const appModule = await import(
          `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`
        );
        const databaseModule = await import(
          `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`
        );

        const app = appModule.initializeApp(config);
        this.db = databaseModule.getDatabase(app);
        this.firebase = databaseModule;
        this.mode = "firebase";
        this.setStatus("RTDB");
      } catch (error) {
        console.warn("Firebase leaderboard unavailable. Falling back to local scores.", error);
        this.mode = "local";
        this.setStatus("Local");
      }
    } else {
      this.setStatus("Local");
    }

    await this.refresh();
  }

  async refresh() {
    if (this.mode === "firebase" && this.db && this.firebase) {
      const {
        get,
        limitToLast,
        orderByChild,
        query,
        ref
      } = this.firebase;

      const scoresQuery = query(
        ref(this.db, this.scoresPath),
        orderByChild("score"),
        limitToLast(10)
      );
      const snapshot = await get(scoresQuery);
      const scores = [];
      snapshot.forEach((child) => {
        scores.push(cleanEntry(child.val()));
      });
      this.scores = scores.sort((a, b) => b.score - a.score);
    } else {
      this.scores = this.readLocalScores();
    }

    this.render();
  }

  async submit(entry) {
    const payload = cleanEntry(entry);

    if (this.mode === "firebase" && this.db && this.firebase) {
      const {
        push,
        ref,
        serverTimestamp
      } = this.firebase;

      const scoreRef = push(ref(this.db, this.scoresPath));
      await this.firebase.set(scoreRef, {
        ...payload,
        createdAt: serverTimestamp()
      });
      await this.refresh();
      return;
    }

    const nextScores = [payload, ...this.readLocalScores()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(nextScores));
    this.scores = nextScores;
    this.render();
  }

  bestScore() {
    return this.scores[0]?.score || 0;
  }

  readLocalScores() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(cleanEntry).sort((a, b) => b.score - a.score).slice(0, 10) : [];
    } catch {
      return [];
    }
  }

  render() {
    this.listEl.replaceChildren();

    if (this.scores.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-score";
      empty.textContent = "No runs yet";
      this.listEl.append(empty);
      return;
    }

    this.scores.forEach((score, index) => {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      const name = document.createElement("strong");
      const meta = document.createElement("span");

      rank.textContent = String(index + 1).padStart(2, "0");
      name.textContent = score.name;
      meta.textContent = `${score.score.toLocaleString()} / ${score.difficulty}`;

      item.append(rank, name, meta);
      this.listEl.append(item);
    });
  }

  setStatus(text) {
    this.statusEl.textContent = text;
    this.statusEl.dataset.mode = text === "RTDB" ? "firebase" : text.toLowerCase();
  }
}
