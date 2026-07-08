
# 🏆 Knowledge Arena: Technical Manifesto

Knowledge Arena is a high-octane, real-time quiz platform designed for the ultimate classroom battle. Built with Next.js 15, Tailwind CSS, and Firebase, it transforms learning into a competitive gladiator experience.

## ⚔️ The Vision
In the Knowledge Arena, students aren't just taking a test—they are **Gladiators** fighting for a spot on the **Podium**. Teachers are **Commanders** who design the challenge and lead the charge.

## 🛡️ Core Features

### 📡 Real-Time Synchronized Battle
Using Firebase Firestore's real-time listeners, every gladiator in the room sees the same question at the exact same millisecond. The Commander controls the flow, advancing the arena only when the round is complete.

### ⚡ Speed-Weighted Scoring
Accuracy is expected; speed is rewarded. 
- **Base Points**: 500 for a correct answer.
- **Speed Bonus**: Up to 500 additional points based on how much time was left on the clock when the answer was submitted.

### 🚫 The Fair Play Engine (Anti-Malpractice)
The Arena is built on honor.
- **Detection**: The app tracks browser focus. Navigating away from the quiz tab triggers a violation.
- **Consequences**: 
  - **First Offense**: A stern warning dialog.
  - **Second Offense**: Immediate disqualification. The student is blocked from answering further questions until the Commander grants **Amnesty**.

### 🏛️ The Victory Podium
At the end of the battle, the top 3 gladiators are featured on a cinematic 3D-style podium with animated trophies (Gold, Silver, Bronze), followed by a leaderboard for the rest of the class.

## 🛠️ Technical Stack
- **Framework**: Next.js 15 (App Router / Turbopack)
- **Database**: Google Firestore (Real-time NoSQL)
- **Auth**: Firebase Authentication (Role-based assignment)
- **Styling**: Tailwind CSS & ShadCN UI
- **Icons**: Lucide React
- **Theme**: Cyberpunk High-Contrast (Electric Blue / Neon Purple)

## 🏗️ Technical Architecture
The app follows a strict **Server-Authoritative** model for security:
1. **Answer Keys**: Stored in a protected subcollection that Students cannot read.
2. **Evaluation**: Scoring is performed by the Teacher's client during the "Round Transition," preventing students from spoofing their own scores.
3. **Security Rules**: Granular Firestore rules ensure that students can only update their own participant data and submissions, while the Teacher maintains full control over the Arena state.

---
*Built for glory. Built for Knowledge Arena.*
