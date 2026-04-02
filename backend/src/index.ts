import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import menusRouter from "./routes/menus";
import reviewsRouter from "./routes/reviews";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/menus", menusRouter);
app.use("/reviews", reviewsRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
