import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Shows from './pages/Shows';
import ShowDetail from './pages/ShowDetail';
import ShowAnalysis from './pages/ShowAnalysis';
import Pipeline from './pages/Pipeline';
import RenderMonitor from './pages/RenderMonitor';
import Assets from './pages/Assets';
import Costs from './pages/Costs';
import EpisodeDetail from './pages/EpisodeDetail';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shows" element={<Shows />} />
        <Route path="/shows/:id" element={<ShowDetail />} />
        <Route path="/shows/:id/analysis" element={<ShowAnalysis />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/pipeline/:date" element={<Pipeline />} />
        <Route path="/render" element={<RenderMonitor />} />
        <Route path="/render/:episodeId" element={<RenderMonitor />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/assets/:episodeId" element={<Assets />} />
        <Route path="/costs" element={<Costs />} />
        <Route path="/episodes/:id" element={<EpisodeDetail />} />
      </Routes>
    </Layout>
  );
}
