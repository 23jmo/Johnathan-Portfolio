import React from 'react'
import {projects} from '../constants'
import { Link } from 'react-router-dom'
import { arrow } from '../assets/icons'
import CTA from '../components/CTA'

const Projects = () => {
  return (
    <section className='max-container'>
      <h1 className='head-text'>
        My <span className='blue-gradient_text font-semibold drop-shadow'>Projects</span>
      </h1>

      <div className='mt-5 flex flex-col gap-3 text-slate-500'>
        <p>I've worked on several projects throughout the years, but these are the ones that I hold closest to my heart</p>
      </div>

      <div className='flex flex-wrap my-20 gap-16'>
        {projects.map((project) => (
          <div className='lg:w-[400px] w-full' key={project.name}>
            <div className='block-container w-12 h-12'>
              <div className={`btn-back rounded-xl ${project.theme}`}/>
              <div className='btn-front rounded-xl flex justify-center items-center'>
                <img src={project.iconUrl}
                alt = "Project Icon"
                className='w-1/2 h-1/2 object-contain' />
              </div>
            </div>
            <div className='mt-5 flex flex-col'>
              <h4 className='text-2xl font-poppins font-semi-bold'>
                {project.name}
              </h4>
              <p>
                {project.description}
              </p>
              <div className='mt-5 flex items-center gap-2 font-poppins'>
                <Link to={project.link} target="_blank" rel="noopener noreferrer" className='flex flex-row items-center gap-5 btn font-semibold text-blue-600'>
                  Check it out!
                  <img
                  src={arrow}
                  alt="arrow"
                  className='w-4 h-4 object-contain filter invert'>

                </img>
                </Link>
                
              </div>
              
            </div>
          </div>
        ))}
      </div>
      <hr className='bg-slate-200'></hr>
      <CTA />
    </section>
  )
}

export default Projects
