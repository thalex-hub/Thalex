import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

async function run() {
  console.log("Checking users with role containing 'Nhân sự' or 'NhanSu'...");
  const users = await getDocs(collection(db, "users"));
  users.forEach(u => {
    const data = u.data();
    if (data.roleId && (data.roleId.includes("Nhân sự") || data.roleId.includes("NhanSu") || data.email === "vietnhan@thalex.vn")) {
      console.log(`User: ${u.id} | Email: ${data.email} | Role: ${data.roleId} | Department: ${data.departmentId}`);
    }
  });
  process.exit(0);
}
run().catch(console.error);
