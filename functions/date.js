const currentDateHeading = document.getElementById("currentDate");

const today = new Date();

currentDateHeading.textContent = today.toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric"
});
