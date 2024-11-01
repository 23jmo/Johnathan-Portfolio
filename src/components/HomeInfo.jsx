import React from 'react'
import { Link } from 'react-router-dom';
import {arrow} from '../assets/icons';

const InfoBox = ({text, link, btnText}) => (
    <div className = "info-box">
        <p className = "sm:text-xl text-center">{text}</p>
        <Link to={link} className = "neo-brutalism-white neo-btn">
            {btnText}
            <img src={arrow} className='w-4 h-4 object-contain'/>
        </Link>
    </div>
)

const renderContent = {
    1: (
        <h1 className="sm:text-xl sm:lead-snug text-center neo-brutalism-blue py-4 px-8 text-white mx-5">
        Hi, I am <span className="font-semibold">Johnathan</span> 👋
        <br />
        A Computer Science Student @ Columbia University
        </h1>
    ),
    2: (
        <InfoBox 
            text={
                <>
                    Conducted research at several computer science labs at <span className="font-semibold">Stanford</span>, <span className="font-semibold">Columbia</span> , and <span className="font-semibold">The University of Michigan</span>
                </>
            }
            link="/about"
            btnText={"Learn More ℹ️"}
        />
    ),
    3: (
       <InfoBox 
            text={
                <>
                    Worked on several innovative projects in <span className="font-semibold">Augmented and Virtual Reality</span>, <span className="font-semibold">Fullstack Applications</span>, and <span className="font-semibold">Machine Learning Research</span>
                </>
            }
                link="/projects"
            btnText={"Visit my Portfolio 🔎"}
        />
    ),
    4: (
        <InfoBox 
            text="If you're interested in collaborating, have a project in mind, or just want to chat, feel free to reach out!"
            link="/contact"
            btnText={"Let's Talk! 💬"}
        />
    ),
}



const HomeInfo = ({currentStage}) => {
  return renderContent[currentStage] || null;
}

export default HomeInfo
