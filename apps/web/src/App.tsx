import { Navigate, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { LegislationDetailPage } from './pages/LegislationDetailPage';
import { LegislationsPage } from './pages/LegislationsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ModificationsPage } from './pages/ModificationsPage';
import { RegulationsPage } from './pages/RegulationsPage';
import { RelatedLegislationsPage } from './pages/RelatedLegislationsPage';
import { SearchPage } from './pages/SearchPage';

export function App(){useEffect(()=>{document.documentElement.lang='ar';document.documentElement.dir='rtl';},[]);return <Routes><Route path="/" element={<Navigate to="/ar" replace/>}/><Route path="/ar" element={<Layout/>}><Route index element={<HomePage/>}/><Route path="legislations" element={<LegislationsPage/>}/><Route path="legislations/:id" element={<LegislationDetailPage/>}/><Route path="legislations/:id/modifications" element={<ModificationsPage/>}/><Route path="legislations/:id/regulations" element={<RegulationsPage/>}/><Route path="legislations/:id/related-legislations" element={<RelatedLegislationsPage/>}/><Route path="search" element={<SearchPage/>}/><Route path="*" element={<NotFoundPage/>}/></Route></Routes>}
