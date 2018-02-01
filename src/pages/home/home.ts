import { Component } from '@angular/core';
import { NavController } from 'ionic-angular';
import {LocationViewPage} from "../location-view/location-view";

@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {

  locations: any = ['п.Щеглово','Сасово','Иваново'];

  constructor(public navCtrl: NavController) {

  }

  goToLocation(location:any) {this.navCtrl.push(LocationViewPage,{
    location : location
  })
  }

  getYandex(mapa: any){
     new mapa.Map("YMapsID", {
      center: [55.87, 37.66],
      zoom: 10
    });
  }

}
