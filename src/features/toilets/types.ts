export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type Toilet = Coordinates & {
  id: string;
  name: string;
  address?: string;
  distanceMeters: number;
  fee?: string;
  openingHours?: string;
  wheelchair?: string;
};

