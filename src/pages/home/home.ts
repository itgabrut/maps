import {Component, OnInit} from '@angular/core';
import { NavController } from 'ionic-angular';
import {LocationViewPage} from "../location-view/location-view";
import {GeneralService} from "../../services/GeneralService";
import {City} from "../../models/City";

@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage implements OnInit{

  cities: Array<City>;

  constructor(public navCtrl: NavController,private service :GeneralService) {}

  ngOnInit(): void {
    this.cities = this.service.getCities();
  }

  goToLocation(location:any) {this.navCtrl.setRoot(LocationViewPage,{
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
