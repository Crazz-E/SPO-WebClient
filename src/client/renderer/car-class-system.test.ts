/**
 * Car Class System Tests
 *
 * Tests INI parsing and CarClassManager for vehicle types.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  CarClassConfig,
  CarClassManager,
  loadCarClassFromIni,
  CAR_DIRECTIONS
} from './car-class-system';

const CAR_CLASSES_DIR = path.join(__dirname, '../../../cache/CarClasses');

// cache/ is the gitignored runtime mirror of the update server — absent on CI.
// The block that reads real INI files only runs where the mirror exists.
const describeWithCarCache = fs.existsSync(CAR_CLASSES_DIR) ? describe : describe.skip;

describe('Car Class System', () => {
  // ==========================================================================
  // INI PARSING
  // ==========================================================================

  describe('loadCarClassFromIni', () => {
    it('should parse a car class INI with all fields', () => {
      const ini = `[General]
Id    = 6
Prob  = 1
Cargo = People

[Images]
64X32N  = Car1.N.bmp
64X32NE = Car1.NE.bmp
64X32E  = Car1.E.bmp
64X32SE = Car1.SE.bmp
64X32S  = Car1.S.bmp
64X32SW = Car1.SW.bmp
64X32W  = Car1.W.bmp
64X32NW = Car1.NW.bmp

[Sounds]
Sound = wave=cars.wav, aten=0.85, loop=1`;

      const config = loadCarClassFromIni(ini);

      expect(config.id).toBe(6);
      expect(config.prob).toBe(1);
      expect(config.cargo).toBe('People');
      expect(Object.keys(config.images)).toHaveLength(8);
      expect(config.images['N']).toBe('Car1.N.bmp');
      expect(config.images['NE']).toBe('Car1.NE.bmp');
      expect(config.images['E']).toBe('Car1.E.bmp');
      expect(config.images['SE']).toBe('Car1.SE.bmp');
      expect(config.images['S']).toBe('Car1.S.bmp');
      expect(config.images['SW']).toBe('Car1.SW.bmp');
      expect(config.images['W']).toBe('Car1.W.bmp');
      expect(config.images['NW']).toBe('Car1.NW.bmp');
    });

    it('should parse a truck with low probability', () => {
      const ini = `[General]
Id    = 5
Prob  = 0.2
Cargo = Light

[Images]
64X32N  = RedTruck.N.bmp
64X32NE = RedTruck.NE.bmp
64X32E  = RedTruck.E.bmp
64X32SE = RedTruck.SE.bmp
64X32S  = RedTruck.S.bmp
64X32SW = RedTruck.SW.bmp
64X32W  = RedTruck.W.bmp
64X32NW = RedTruck.NW.bmp

[Sounds]
Sound = wave=trucks.wav, aten=0.8, loop=1`;

      const config = loadCarClassFromIni(ini);

      expect(config.id).toBe(5);
      expect(config.prob).toBe(0.2);
      expect(config.cargo).toBe('Light');
      expect(config.images['N']).toBe('RedTruck.N.bmp');
    });

    it('should handle missing fields with defaults', () => {
      const ini = `[General]

[Images]`;

      const config = loadCarClassFromIni(ini);

      expect(config.id).toBe(0);
      expect(config.prob).toBe(1);
      expect(config.cargo).toBe('People');
      expect(Object.keys(config.images)).toHaveLength(0);
    });

    it('should handle empty INI', () => {
      const config = loadCarClassFromIni('');

      expect(config.id).toBe(0);
      expect(config.prob).toBe(1);
      expect(config.cargo).toBe('People');
      expect(Object.keys(config.images)).toHaveLength(0);
    });
  });

  // ==========================================================================
  // CAR CLASS MANAGER
  // ==========================================================================

  describe('CarClassManager', () => {
    let manager: CarClassManager;

    beforeEach(() => {
      manager = new CarClassManager();
    });

    it('should load a car class and retrieve it by ID', () => {
      const ini = `[General]
Id = 6
Prob = 1
Cargo = People

[Images]
64X32N = Car1.N.bmp
64X32S = Car1.S.bmp`;

      manager.loadFromIni(ini);

      expect(manager.getClassCount()).toBe(1);
      const config = manager.getClass(6);
      expect(config).toBeDefined();
      expect(config!.id).toBe(6);
      expect(config!.cargo).toBe('People');
    });

    it('should load multiple classes', () => {
      manager.loadAll([
        `[General]\nId = 1\nProb = 1\nCargo = People\n[Images]\n64X32N = Cyanvan.N.bmp`,
        `[General]\nId = 5\nProb = 0.2\nCargo = Light\n[Images]\n64X32N = RedTruck.N.bmp`,
      ]);

      expect(manager.getClassCount()).toBe(2);
      expect(manager.getClass(1)?.cargo).toBe('People');
      expect(manager.getClass(5)?.cargo).toBe('Light');
    });

    it('should return all classes', () => {
      manager.loadAll([
        `[General]\nId = 1\nProb = 1\nCargo = People\n[Images]`,
        `[General]\nId = 2\nProb = 1\nCargo = People\n[Images]`,
        `[General]\nId = 3\nProb = 0.5\nCargo = Light\n[Images]`,
      ]);

      expect(manager.getAllClasses()).toHaveLength(3);
    });

    it('should return undefined for unknown class ID', () => {
      expect(manager.getClass(999)).toBeUndefined();
    });

    it('should get image filename for class and direction', () => {
      manager.loadFromIni(`[General]\nId = 6\nProb = 1\nCargo = People\n[Images]\n64X32N = Car1.N.bmp\n64X32E = Car1.E.bmp`);

      expect(manager.getImageFilename(6, 'N')).toBe('Car1.N.bmp');
      expect(manager.getImageFilename(6, 'E')).toBe('Car1.E.bmp');
      expect(manager.getImageFilename(6, 'S')).toBeNull(); // Not loaded
      expect(manager.getImageFilename(999, 'N')).toBeNull(); // Unknown class
    });

    it('should select random class weighted by probability', () => {
      // Load one high-prob and one low-prob class
      manager.loadAll([
        `[General]\nId = 1\nProb = 1\nCargo = People\n[Images]`,
        `[General]\nId = 2\nProb = 0.01\nCargo = Light\n[Images]`,
      ]);

      // Run many random selections - high-prob should dominate
      const counts: Record<number, number> = { 1: 0, 2: 0 };
      for (let i = 0; i < 1000; i++) {
        const cls = manager.getRandomClass();
        if (cls) counts[cls.id]++;
      }

      // Class 1 (prob=1) should be selected much more than class 2 (prob=0.01)
      expect(counts[1]).toBeGreaterThan(counts[2] * 5);
    });

    it('should return undefined from getRandomClass when empty', () => {
      expect(manager.getRandomClass()).toBeUndefined();
    });

    it('should clear all classes', () => {
      manager.loadFromIni(`[General]\nId = 1\nProb = 1\nCargo = People\n[Images]`);
      expect(manager.getClassCount()).toBe(1);

      manager.clear();
      expect(manager.getClassCount()).toBe(0);
      expect(manager.getClass(1)).toBeUndefined();
    });
  });

  // ==========================================================================
  // REAL INI FILE PARSING (integration)
  // ==========================================================================

  describeWithCarCache('Real CarClasses INI files', () => {
    const iniFiles = fs.existsSync(CAR_CLASSES_DIR)
      ? fs.readdirSync(CAR_CLASSES_DIR).filter(f => f.toLowerCase().endsWith('.ini'))
      : [];

    it('should find car class INI files in cache', () => {
      expect(iniFiles.length).toBeGreaterThan(0);
    });

    it('should parse all real car class INI files without errors', () => {
      const manager = new CarClassManager();

      for (const file of iniFiles) {
        const content = fs.readFileSync(path.join(CAR_CLASSES_DIR, file), 'utf-8');
        expect(() => manager.loadFromIni(content)).not.toThrow();
      }

      // Should have loaded all unique car class IDs
      expect(manager.getClassCount()).toBeGreaterThan(0);
      console.log(`Loaded ${manager.getClassCount()} car classes from ${iniFiles.length} INI files`);
    });

    it('should have all 8 directional sprites for each car class', () => {
      for (const file of iniFiles) {
        const content = fs.readFileSync(path.join(CAR_CLASSES_DIR, file), 'utf-8');
        const config = loadCarClassFromIni(content);

        const directionCount = Object.keys(config.images).length;
        expect(directionCount).toBe(8);

        for (const dir of CAR_DIRECTIONS) {
          expect(config.images[dir]).toBeDefined();
        }
      }
    });

    it('should reference BMP files that exist in CarImages directory', () => {
      const carImagesDir = path.join(__dirname, '../../../cache/CarImages');
      if (!fs.existsSync(carImagesDir)) return;

      const availableImages = new Set(
        fs.readdirSync(carImagesDir).map(f => f.toLowerCase())
      );

      for (const file of iniFiles) {
        const content = fs.readFileSync(path.join(CAR_CLASSES_DIR, file), 'utf-8');
        const config = loadCarClassFromIni(content);

        for (const [dir, filename] of Object.entries(config.images)) {
          expect(availableImages.has(filename.toLowerCase())).toBe(true);
        }
      }
    });
  });
});
