import React, { useState, useEffect } from 'react';
import './Survey.css';

const Survey = () => {
    const [theme, setTheme] = useState('light');
    const [currentStep, setCurrentStep] = useState(1);

    const toggleTheme = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    useEffect(() => {
        document.body.className = theme === 'dark' ? 'dark-mode' : '';
    }, [theme]);

    const nextStep = () => {
        if (currentStep < 5) {
            setCurrentStep(currentStep + 1);
        }
    };

    const prevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const rewardCode = Math.random().toString(36).substr(2, 8).toUpperCase();
        createConfetti();
        setTimeout(() => {
            alert(`Congratulations! Your survey has been submitted anonymously.\n\nYour reward code is: ${rewardCode}\n\nPlease save this code to claim your selected reward.`);
            // Reset form logic here
            setCurrentStep(1);
        }, 500);
    };

    const createConfetti = () => {
        const celebration = document.getElementById('celebration');
        if (celebration) {
            for (let i = 0; i < 100; i++) {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                confetti.style.left = Math.random() * 100 + 'vw';
                confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 70%, 50%)`;
                confetti.style.animation = `confettiFall ${Math.random() * 2 + 3}s linear forwards`;
                celebration.appendChild(confetti);

                setTimeout(() => {
                    confetti.remove();
                }, 5000);
            }
        }
    };

    return (
        <div>
            <button className="theme-toggle" onClick={toggleTheme}>
                <i className={`fas ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`}></i>
            </button>
            <div className="container">
                <header>
                    <h1>Anonymous Construction Industry Survey</h1>
                    <p>Share your insights safely and securely. Your feedback helps improve industry standards.</p>
                </header>
                <form className="survey-form" id="surveyForm" onSubmit={handleSubmit}>
                    <ProgressBar currentStep={currentStep} />
                    <Step step={1} currentStep={currentStep}>
                        <h2>Company Information</h2>
                        <div className="form-group">
                            <label>Company Size</label>
                            <select required>
                                <option value="">Select size range</option>
                                <option value="1-10">1-10 employees</option>
                                <option value="11-50">11-50 employees</option>
                                <option value="51-200">51-200 employees</option>
                                <option value="201-500">201-500 employees</option>
                                <option value="500+">500+ employees</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Primary Construction Focus</label>
                            <select required>
                                <option value="">Select focus area</option>
                                <option value="residential">Residential</option>
                                <option value="commercial">Commercial</option>
                                <option value="industrial">Industrial</option>
                                <option value="infrastructure">Infrastructure</option>
                                <option value="specialized">Specialized</option>
                            </select>
                        </div>
                    </Step>
                    <Step step={2} currentStep={currentStep}>
                        <h2>Safety & Operations</h2>
                        <div className="form-group">
                            <label>How would you rate your company's safety measures? (1-10)</label>
                            <input type="number" min="1" max="10" required />
                        </div>
                        <div className="form-group">
                            <label>Major Safety Concerns</label>
                            <textarea rows="4" required placeholder="Describe any safety concerns..."></textarea>
                        </div>
                    </Step>
                    <Step step={3} currentStep={currentStep}>
                        <h2>Industry Challenges</h2>
                        <div className="form-group">
                            <label>Current Business Challenges</label>
                            <select multiple required>
                                <option value="labor">Labor Shortage</option>
                                <option value="costs">Rising Material Costs</option>
                                <option value="competition">Market Competition</option>
                                <option value="regulations">Regulatory Compliance</option>
                                <option value="technology">Technology Adoption</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Suggested Improvements</label>
                            <textarea rows="4" required placeholder="Share your suggestions..."></textarea>
                        </div>
                    </Step>
                    <Step step={4} currentStep={currentStep}>
                        <h2>Future Outlook</h2>
                        <div className="form-group">
                            <label>Investment Plans (Next 5 Years)</label>
                            <select required>
                                <option value="">Select primary investment area</option>
                                <option value="equipment">Equipment & Machinery</option>
                                <option value="technology">Technology & Software</option>
                                <option value="training">Employee Training</option>
                                <option value="expansion">Business Expansion</option>
                                <option value="sustainability">Sustainability Initiatives</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Additional Comments</label>
                            <textarea rows="4" placeholder="Any other thoughts..."></textarea>
                        </div>
                    </Step>
                    <Step step={5} currentStep={currentStep}>
                        <h2>Claim Your Reward</h2>
                        <div className="reward-section">
                            <div className="reward-intro">
                                <i className="fas fa-gift reward-icon"></i>
                                <p>Thank you for completing our survey! Please select your preferred reward:</p>
                            </div>
                            <div className="reward-options">
                                <RewardCard id="reward1" value="discount" icon="fa-percentage" title="10% Discount" description="On your next safety equipment purchase" />
                                <RewardCard id="reward2" value="consultation" icon="fa-comments" title="Free Consultation" description="30-minute safety consultation session" />
                                <RewardCard id="reward3" value="training" icon="fa-graduation-cap" title="Training Access" description="Free access to online safety training module" />
                            </div>
                            <div className="reward-note">
                                <p><i className="fas fa-info-circle"></i> Your reward code will be generated upon submission</p>
                            </div>
                        </div>
                    </Step>
                    <div className="buttons">
                        {currentStep > 1 && <button type="button" className="btn prev-btn" onClick={prevStep}>Previous</button>}
                        {currentStep < 5 && <button type="button" className="btn next-btn" onClick={nextStep}>Next</button>}
                        {currentStep === 5 && <button type="submit" className="btn submit-btn">Submit</button>}
                    </div>
                    <div className="privacy-notice">
                        <p><i className="fas fa-shield-alt"></i> Your responses are completely anonymous. We do not collect any identifying information.</p>
                    </div>
                    <div className="celebration" id="celebration"></div>
                </form>
            </div>
        </div>
    );
};

const ProgressBar = ({ currentStep }) => (
    <div className="progress-bar">
        <div className="progress-line"></div>
        {[1, 2, 3, 4, 5].map(step => (
            <div key={step} className={`progress-step ${currentStep >= step ? 'active' : ''}`}>{step}</div>
        ))}
    </div>
);

const Step = ({ step, currentStep, children }) => (
    <div className={`form-step ${currentStep === step ? 'active' : ''}`} data-step={step}>
        {children}
    </div>
);

const RewardCard = ({ id, value, icon, title, description }) => (
    <div className="reward-card">
        <input type="radio" name="reward" id={id} value={value} required />
        <label htmlFor={id} className="reward-label">
            <i className={`fas ${icon}`}></i>
            <h3>{title}</h3>
            <p>{description}</p>
        </label>
    </div>
);

export default Survey;
