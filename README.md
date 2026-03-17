# 🏆 Knowledge Arena

Knowledge Arena is a high-octane, real-time quiz platform designed for the ultimate classroom battle. Built with Next.js 15, Tailwind CSS, and Firebase, it transforms learning into a competitive gladiator experience.

## ⚔️ Key Features

- **Live Battle Rooms**: Teachers create "Arenas" and lead students through timed rounds of questions.
- **Fair Play Engine**: Integrated malpractice detection automatically warns or blocks students who switch tabs or lose focus during a battle.
- **Gladiator Scoring**: Points are awarded based on accuracy and speed. The faster you answer correctly, the more points you earn.
- **The Podium**: A cinematic results screen that celebrates the top 3 finishers with Gold, Silver, and Bronze honors.
- **Seamless Entry**: Students join instantly using 6-digit room codes or by scanning teacher-generated QR codes.
- **Avatar Selection**: Players choose from a library of emojis to represent their gladiator in the arena.

## 🛡️ For Teachers (Commanders)

1. **Construct Arena**: Use the "Create Quiz" tool to set questions, options, and timers.
2. **The Waiting Room**: Open the room to students. Monitor the "Gladiators in the Arena" list as they join.
3. **Control the Battle**: You control the flow. Advance questions only when you're ready.
4. **Enforce Amnesty**: If a student is blocked for malpractice, you can grant them "Amnesty" (unblock) from your dashboard.

## 🏹 For Students (Gladiators)

1. **Enter the Arena**: Log in and enter the room code provided by your teacher.
2. **Stay Focused**: Do NOT switch tabs or minimize the browser during a live quiz. The Fair Play engine is watching.
3. **Be Fast, Be Right**: Read carefully, but answer quickly to maximize your score.

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS & ShadCN UI
- **Backend**: Firebase Auth & Firestore
- **Icons**: Lucide React
- **Fonts**: Space Grotesk & Inter

## 🚀 Deployment

This app is optimized for **Firebase App Hosting**. 

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Deploy: `firebase deploy`

---
*Built for glory. Built for Knowledge Arena.*