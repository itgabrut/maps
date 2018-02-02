export class City {

  constructor(name:string, coord:Array<number>,zoom:number=15){
    this.name = name;
    this.center = coord;
    this.zoom = zoom;
  }
  name: string;
  center: Array<number>;
  zoom:number;
  locations: Array<Location> = [];

  setLocation(loc:Location){
    this.locations.push(loc);
  }

}

export class Location {
  name: string;
  coordLoc: Array<number>;
}
