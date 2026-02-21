function makeDecision() {
    const options = ["Yes", "No", "Maybe"];
    const random = Math.floor(Math.random() * options.length);
    document.getElementById("result").textContent = options[random];
}
