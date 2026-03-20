// portless.config.js — local HTTPS dev proxy for Parallax microservices
// Docs: https://portless.dev/
export default {
  services: [
    {
      id: "gateway",
      url: "http://localhost:3000",
      process: {
        command: "bun run dev",
        cwd: "./gateway",
      },
    },
    {
      id: "worker",
      url: "http://localhost:8000",
      process: {
        command: "uv run uvicorn parallax_worker.main:app --host 0.0.0.0 --port 8000 --reload",
        cwd: "./worker",
      },
    },
  ],
};
