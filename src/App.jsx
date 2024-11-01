import {Route, BrowserRouter as Router, Routes} from 'react-router-dom';
import Navbar from './components/Navbar';
import {Home, About, Projects, Contact} from './pages';

//router has to wrap everything
const App = () => {
  return (
    <main className="bg-slate-300/20 h-full">
        <Router> 
            <Navbar />
            <Routes>    
                <Route path="/Johnathan-Portfolio" element={<Home />} /> {/* self closing routes that renders components */}
                <Route path="/" element={<Home />} /> {/* self closing routes that renders components */}
                <Route path = "/about" element = {<About />} />
                <Route path = "/projects" element = {<Projects />} />
                <Route path = "/contact" element = {<Contact />} />
            </Routes>
        </Router>
    </main>
    
  )
}

export default App
