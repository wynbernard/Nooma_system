import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import NoomaLanding from "./pages/LandingPage";
import Dashboard from "./components/Dashboard/dashboard";
import { Toaster } from "@/components/ui/sonner";

function DashboardPage() {
  const navigate = useNavigate();
  const username = sessionStorage.getItem("nooma_username");
  const role = sessionStorage.getItem("nooma_role");

  if (!username || !role) {
    return <Navigate to="/" replace />;
  }

  return (
    <Dashboard
      userEmail={username}
      userRole={role}
      onLogout={() => {
        sessionStorage.removeItem("nooma_username");
        sessionStorage.removeItem("nooma_role");
        navigate("/", { replace: true });
      }}
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<NoomaLanding />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors position="top-right" theme="dark" />
    </BrowserRouter>
  );
}
