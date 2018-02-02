

import {City, Location} from "../models/City";


export class GeneralService{

  private _map:any;

  private cities = [];

  constructor(){
     this.cities.push(new City('п.Щеглово',[60.03, 30.75]),new City('Иваново',[56.99,40.97],13),new City('Сасово',[54.34,41.91],13));
     this.generateLocations().forEach( val => {
       this.cities[0].setLocation(val)
     });
  }

  generateLocations():Array<Location>{

    let arr = [];

    function getRandom(numbers: [number, number]):number{
      let offset = numbers[1] - numbers[0];
      let random = numbers[0] + Math.floor(Math.random() * Math.floor(offset));
      return random * 0.001
    }

    for(let i = 1;i<11;i++){
      arr.push({name:'Брандспойт №' + i ,coordLoc:[new Number(60+getRandom([22,55])),new Number(30 + getRandom([720,780]))]})
    }
    return arr;
  }

  getCities(){
    return this.cities.slice();
  }

  get map(): any {
    return this._map;
  }


  set map(value: any) {
    this._map = value;
  }

}
