import { AppDataProvider } from "./app/AppDataProvider";
import { CompensationReferenceProvider } from "./app/CompensationReferenceProvider";
import { HrImportProvider } from "./app/HrImportProvider";
import { SimulationConfigurationProvider } from "./app/SimulationConfigurationProvider";
import { SimulationExecutionProvider } from "./app/SimulationExecutionProvider";
import { AppShell } from "./app/AppShell";
import type { AppServices } from "./services/createAppServices";
import "./styles/global.css";

interface AppProps {
  services?: AppServices;
  initializeErrorFactory?: () => Error | null;
}

function App({ services, initializeErrorFactory }: AppProps) {
  return (
    <AppDataProvider
      services={services}
      initializeErrorFactory={initializeErrorFactory}
    >
      <CompensationReferenceProvider>
        <HrImportProvider>
          <SimulationConfigurationProvider>
            <SimulationExecutionProvider>
              <AppShell />
            </SimulationExecutionProvider>
          </SimulationConfigurationProvider>
        </HrImportProvider>
      </CompensationReferenceProvider>
    </AppDataProvider>
  );
}

export default App;
