import { mayahdesign, meta, nih, shopify, stanford, starbucks, tesla, umich } from "../assets/images";
import {
    car,
    contact,
    csharp,
    css,
    estate,
    express,
    git,
    github,
    html,
    javascript,
    linkedin,
    mongodb,
    motion,
    mui,
    nextjs,
    nodejs,
    pricewise,
    react,
    redux,
    sass,
    snapgram,
    sql,
    summiz,
    tailwindcss,
    threads,
    typescript,
    c,
    cplusplus,
    java,
    python,
    unity,
} from "../assets/icons";

export const skills = [
    {
        imageUrl: css,
        name: "CSS",
        type: "Frontend",
    },
    {
        imageUrl: express,
        name: "Express",
        type: "Backend",
    },
    {
        imageUrl: git,
        name: "Git",
        type: "Version Control",
    },
    {
        imageUrl: github,
        name: "GitHub",
        type: "Version Control",
    },
    {
        imageUrl: html,
        name: "HTML",
        type: "Frontend",
    },
    {
        imageUrl: javascript,
        name: "JavaScript",
        type: "Frontend",
    },
    {
        imageUrl: mongodb,
        name: "MongoDB",
        type: "Database",
    },
    // {
    //     imageUrl: motion,
    //     name: "Motion",
    //     type: "Animation",
    // },
    {
        imageUrl: mui,
        name: "Material-UI",
        type: "Frontend",
    },
    {
        imageUrl: nextjs,
        name: "Next.js",
        type: "Frontend",
    },
    {
        imageUrl: nodejs,
        name: "Node.js",
        type: "Backend",
    },
    {
        imageUrl: react,
        name: "React",
        type: "Frontend",
    },
    // {
    //     imageUrl: redux,
    //     name: "Redux",
    //     type: "State Management",
    // },
    // {
    //     imageUrl: sass,
    //     name: "Sass",
    //     type: "Frontend",
    // },
    {
        imageUrl: tailwindcss,
        name: "Tailwind CSS",
        type: "Frontend",
    },
    {
        imageUrl: typescript,
        name: "TypeScript",
        type: "Frontend",
    },
    {
        imageUrl: python,
        name: "Python",
        type: "Backend",
    },
    {
        imageUrl: sql,
        name: "SQL",
        type: "Backend",
    },
    {
        imageUrl: unity,
        name: "Unity",
        type: "AR/VR",
    },
    {
        imageUrl: csharp,
        name: "C#",
        type: "Backend",
    },
    {
        imageUrl: c,
        name: "C",
        type: "Backend",
    },
    {
        imageUrl: cplusplus,
        name: "C++",
        type: "Backend",
    },
    {
        imageUrl: java,
        name: "Java",
        type: "Backend",
    },
];

export const experiences = [
    {
        title: "Software Engineer Intern",
        company_name: "Mayah Design",
        icon: mayahdesign,
        iconBg: "#accbe1",
        date: "August 2024 - Present",
        points: [
            "Developing product visualization features using React.js and other related technologies.",
            "Collaborating with cross-functional teams including product managers, other developers, and the CEO to ship high quality code.",
            "Implementing responsive design and ensuring cross-browser compatibility.",
            "Participating in code reviews and providing constructive feedback to other developers.",
        ],
    },
    {
        title: "AR/VR Software Engineering Intern",
        company_name: "National Institutes of Health",
        icon: nih,
        iconBg: "#d6d6d6",
        date: "May 2024 - August 2024",
        points: [
            "Pioneered a medical augmented reality interaction and visualization application using Unity, C#, Photon Fusion, OpenAI, and Microsoft Azure Speech Cognition Services for surgical application.",
            "Presented my summer project to the Scientific Director of the NIBIB as well as a team of surgeons.",
            "Collaborated with PhD student and Principle Investigator to output meaningful contributions that would support a future thesis"
        ],
    },
    {
        title: "Research Assistant",
        company_name: "University of Michigan Cai Lab",
        icon: umich,
        iconBg: "#ffeb57",
        date: "September 2023 - May 2024",
        points: [
            "Innovated machine learning algorithm for 3D segmentation of neurons in brain scans leveraging Python, U-Net architecture, and libraries like wandb, TensorFlow, and PyTorch, leading to 50% reduction in memory usage.",
            "Engineered a 3D flood-filling algorithm using set operations, leading to a 26x reduction in processing time.",
            "Presented work to over 500 students and broader research community at research fair",
        ],
    },
    {
        title: "Research Assistant",
        company_name: "Stanford Optima Group",
        icon: stanford,
        iconBg: "#d44e4e",
        date: "May 2023 - August 2023",
        points: [
            "Conceptualized and executed research project leveraging Google Cloud Platform, HuggingFace Transformers, Numpy, Pandas, PyTorch, and Gradio to compare effectiveness of traditional Convolutional Neural Networks against Visual Large Language Models on recognizing Glaucoma Images.",
            "Harnessed Few-Shot Prompting, and Chain-Of-Thought prompting to improve VLLM performance by 30%.",
        ],
    },
];

export const socialLinks = [
    {
        name: 'Contact',
        iconUrl: contact,
        link: '/contact',
    },
    {
        name: 'GitHub',
        iconUrl: github,
        link: 'https://github.com/23jmo',
    },
    {
        name: 'LinkedIn',
        iconUrl: linkedin,
        link: 'https://www.linkedin.com/in/johnathan-mo/',
    }
];

export const projects = [
    {
        iconUrl: pricewise,
        theme: 'btn-back-red',
        name: 'Manu.AI',
        description: 'Innovated a B2B service that turns inconvenient traditional user manuals into interactive digital knowledgebase, allowing users to chat with the manual',
        link: 'http://usermanuai.com',
    },
    {
        iconUrl: threads,
        theme: 'btn-back-green',
        name: 'Professor Parrot',
        description: 'Implemented an AI-powered Advanced Placement (AP) tutoring website using Hybrid.js, Redis, Lang-chain, OpenAI, and deployed with Heroku to simplify and explain AP material to students without access to AP courses.',
        link: 'https://github.com/YnotCode/professor-parrot-mhacks',
    },
    {
        iconUrl: car,
        theme: 'btn-back-blue',
        name: 'Using GANs and CNNs to More Accurately Diagnose Skin Conditions',
        description: 'Modified a version of the Pix2Pix Generative Adversarial Network (GAN) architecture and Inception v3 Convolutional Neural Network (CNN) model using Python to more accurately diagnose skin conditions; awarded 1st award at local science fair, 4th place at the California Science and Engineering Fair (CSEF)',
        link: '',
    },
    {
        iconUrl: snapgram,
        theme: 'btn-back-pink',
        name: 'Word Hunt Bot',
        description: 'Created an Arduino-powered bot that holds the world record score for the game \'Word Hunt\'',
        link: 'https://github.com/23jmo/WordHunt',
    },
    {
        iconUrl: estate,
        theme: 'btn-back-black',
        name: 'Medical Augmented Reality Toolkit for Visualization and Interaction',
        description: 'Pioneered a medical augmented reality interaction and visualization application using Unity, C#, Photon Fusion, OpenAI, and Microsoft Azure Speech Cognition Services for surgical application.',
        link: '',
    },
    // {
    //     iconUrl: summiz,
    //     theme: 'btn-back-yellow',
    //     name: 'AI Summarizer Application',
    //     description: 'App that leverages AI to automatically generate concise & informative summaries from lengthy text content, or blogs.',
    //     link: 'https://github.com/adrianhajdin/project_ai_summarizer',
    // }
];