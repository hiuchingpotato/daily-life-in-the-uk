# Daily life in the UK

A quiz game for practising the Life in the UK test.

- **Instant Play**: unlimited random questions, with an optional 30-second time limit. Tracks your score and streak, and lists questions to review when you end the game.
- **Daily**: the same 5 questions for everyone each day. A new set unlocks at local midnight. Your result is saved in the browser so you can share it.
- **Mock Test**: 24 questions in 45 minutes, like the real test. No feedback until the end; you need 18/24 (75%) to pass.

The questions cover all four Life in the UK test formats: one correct answer, choose TWO, true/false, and "which statement is correct". They're stored in `questions.js`.

## Run locally

It's a static site with no build step:

```bash
python3 -m http.server 5178
```

Then open http://localhost:5178.
