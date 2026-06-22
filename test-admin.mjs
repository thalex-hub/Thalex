import admin from "firebase-admin";

admin.initializeApp();
admin.auth().listUsers(1)
  .then(users => console.log("Success!", users))
  .catch(err => console.error("Error!", err));
