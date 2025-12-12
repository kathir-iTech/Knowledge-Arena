# Knowledge Arena

This is a Next.js quiz application built in Firebase Studio.

## Running Locally

To run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## How to Deploy Your App

Your application is ready to be deployed to the world using **Firebase App Hosting**. Once deployed, anyone will be able to access it from a public URL.

Follow these steps on your local machine:

### Step 1: Install the Firebase CLI

If you don't already have it, install the Firebase Command Line Interface (CLI). This is a powerful tool that lets you manage your Firebase projects. Open your terminal and run this command:

```bash
npm install -g firebase-tools
```

### Step 2: Log in to Firebase

Next, log in to your Firebase account in the terminal. This will open a browser window for you to authenticate.

```bash
firebase login
```

### Step 3: Deploy the App

Navigate to your project's root directory in the terminal (the folder containing this `README.md` file).

Run the following command to start the deployment:

```bash
firebase deploy
```

The Firebase CLI will automatically read your `apphosting.yaml` configuration, build your Next.js application for production, and deploy it to Firebase App Hosting.

Once the deployment is complete, the terminal will show you the **Hosting URL**. This is the live, public link to your application! You can share it with anyone.
