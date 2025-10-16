// Theme Toggle
const themeToggle = document.querySelector('.theme-toggle');
const body = document.body;
const icon = themeToggle.querySelector('i');

themeToggle.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    icon.classList.toggle('fa-moon');
    icon.classList.toggle('fa-sun');
});

// Multi-step Form
const form = document.getElementById('surveyForm');
const steps = Array.from(form.getElementsByClassName('form-step'));
const progressSteps = Array.from(document.getElementsByClassName('progress-step'));
const nextBtn = form.querySelector('.next-btn');
const prevBtn = form.querySelector('.prev-btn');
const submitBtn = form.querySelector('.submit-btn');

let currentStep = 0;

function updateButtons() {
    prevBtn.style.display = currentStep > 0 ? 'block' : 'none';
    nextBtn.style.display = currentStep < steps.length - 1 ? 'block' : 'none';
    submitBtn.style.display = currentStep === steps.length - 1 ? 'block' : 'none';
}

function updateProgress() {
    progressSteps.forEach((step, index) => {
        if (index <= currentStep) {
            step.classList.add('active');
        } else {
            step.classList.remove('active');
        }
    });
}

function showStep(step) {
    steps.forEach(s => s.classList.remove('active'));
    steps[step].classList.add('active');
    currentStep = step;
    updateButtons();
    updateProgress();
}

function createConfetti() {
    const celebration = document.getElementById('celebration');
    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 70%, 50%)`;
        confetti.style.animation = `confettiFall ${Math.random() * 2 + 3}s linear forwards`;
        celebration.appendChild(confetti);
        
        // Remove confetti after animation
        setTimeout(() => {
            confetti.remove();
        }, 5000);
    }
}

nextBtn.addEventListener('click', () => {
    if (currentStep < steps.length - 1) {
        showStep(currentStep + 1);
    }
});

prevBtn.addEventListener('click', () => {
    if (currentStep > 0) {
        showStep(currentStep - 1);
    }
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Generate random reward code
    const rewardCode = Math.random().toString(36).substr(2, 8).toUpperCase();
    
    createConfetti();
    
    setTimeout(() => {
        alert(`Congratulations! Your survey has been submitted anonymously.\n\nYour reward code is: ${rewardCode}\n\nPlease save this code to claim your selected reward.`);
        form.reset();
        showStep(0);
    }, 500);
});

// Initialize form
showStep(0);
