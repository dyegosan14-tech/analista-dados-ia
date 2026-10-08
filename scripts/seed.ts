import { config } from '../src/config';
import { seedDatabase } from '../src/db/seed';

// Atenção: recria o banco do zero. Pare o servidor antes de rodar.
seedDatabase(config.dbPath);
