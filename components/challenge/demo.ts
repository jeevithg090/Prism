// P5 · Demo micro-challenge data (used by "Use demo data" when the API can't be reached). The public Docker task only:
// no grading rules and no sample answer ship to the browser.
import type { ChallengeMenu, PublicChallenge } from "./model";

export const DEMO_MENU: ChallengeMenu = {
  userId: "aisha",
  focusSkillId: "docker",
  options: [
    { skillId: "docker", skillName: "Docker", demand: 0.41, status: "gap", tried: false },
    { skillId: "pytorch", skillName: "PyTorch", demand: 0.38, status: "gap", tried: false },
    { skillId: "sql", skillName: "SQL", demand: 0.35, status: "gap", tried: false },
    { skillId: "aws", skillName: "AWS", demand: 0.33, status: "gap", tried: false },
    { skillId: "python", skillName: "Python", demand: 0.62, status: "proven", tried: false },
    { skillId: "git", skillName: "Git", demand: 0.3, status: "proven", tried: false },
  ],
};

export const DEMO_CHALLENGE: PublicChallenge = {
  "id": "ch_docker_01",
  "skillId": "docker",
  "skillName": "Docker",
  "title": "Make the captioning API image rebuild in seconds",
  "minutes": 20,
  "context": "Your pod issue is \"Containerise the captioning API with Docker\". Right now every one-line code change reinstalls PyTorch, the image is over 1 GB and the API runs as root. Fix the Dockerfile before Priya reviews it.",
  "prompt": "Rewrite this Dockerfile so that:\n1. Changing a line of app code doesn't reinstall the dependencies.\n2. The image starts from a smaller official Python base.\n3. The API doesn't run as root.\n4. pip doesn't leave its download cache in the image.\nKeep the API serving on port 8000.",
  "language": "dockerfile",
  "fileName": "Dockerfile",
  "starter": "FROM python:3.12\nWORKDIR /app\nCOPY . .\nRUN pip install -r requirements.txt\nEXPOSE 8000\nCMD [\"uvicorn\", \"app.main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"8000\"]\n",
  "rubric": [
    {
      "id": "deps-layer",
      "title": "Dependencies install in their own cached layer",
      "description": "requirements.txt is copied and installed before the rest of the source."
    },
    {
      "id": "slim-base",
      "title": "Starts from a smaller base image",
      "description": "The base image ships only what the API needs."
    },
    {
      "id": "non-root",
      "title": "Runs as a non-root user",
      "description": "The last USER instruction switches away from root."
    },
    {
      "id": "pip-cache",
      "title": "Leaves no pip cache behind",
      "description": "Downloaded wheels aren't kept in the image layer."
    }
  ],
  "checksCount": 3,
  "resources": [
    {
      "title": "Docker docs: Optimise builds with the build cache",
      "url": "https://docs.docker.com/build/cache/"
    },
    {
      "title": "Docker docs: Dockerfile best practices",
      "url": "https://docs.docker.com/build/building/best-practices/"
    }
  ],
  "source": "fixture"
};
