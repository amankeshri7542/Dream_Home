export const LIMITS = Object.freeze({
  floors: 8,
  roomsPerFloor: 48,
  units: 64,
  verticalSpaces: 8,
  balconiesPerFloor: 4,
  stagedRooms: 48,
  importBytes: 1_000_000,
  openingsPerFloor: 256,
  furniturePerRoom: 32,
  furnitureTotal: 800,
  landscapeItems: 120,
});
export const getLimits = () => LIMITS;
