import {Component, OnInit} from '@angular/core';
import {MenuController, NavController, NavParams, Platform} from 'ionic-angular';
import {GeneralService} from "../../services/GeneralService";
import {HomePage} from "../home/home";
import {City} from "../../models/City";

/**
 * Generated class for the LocationViewPage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@Component({
  selector: 'page-location-view',
  templateUrl: 'location-view.html',
})
export class LocationViewPage implements OnInit{

  location: City;
  myMap:any;

  constructor(public navCtrl: NavController,
              public navParams: NavParams,
              public menuCtrl: MenuController,
              public mservice:GeneralService,
              private platform: Platform) {
  let deregister= platform.registerBackButtonAction(()=>{
      this.navCtrl.setRoot(HomePage);
      deregister();
    })
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad LocationViewPage');
  }


  ngOnInit(): void {
    this.location = this.navParams.get('location');
      if(this.mservice.map){
      this.getYandex(this.mservice.map);
    }
  }

  toggleMenu() {
    this.navCtrl.setRoot(HomePage);
  }

  getYandex(mapa: any){
    // this.myMap = new mapa.Map("map", {
    //   center: [60.03, 30.75],
    //   zoom: 15
    // });

    this.myMap = new mapa.Map("map",this.location);
    let listBrands = this.location.locations;

    listBrands.forEach((val)=>{
      this.myMap.geoObjects.add(new mapa.Placemark(val.coordLoc,{},{
        iconLayout:'default#image',
        iconImageHref:'../assets/imgs/tube.png',
        iconImageSize: [30,42],
        iconImageOffset: [0,-40]
      }));
    });

    // const myGeoObject = new mapa.Placemark([55.87, 37.66],{},{
    //   iconLayout:'default#image',
    //   iconImageHref:'../assets/imgs/tube.png',
    //   iconImageSize: [30,42],
    //   iconImageOffset: [0,-40]
    // });
    //
  }

  goToSpecificBr(brand) {
    this.menuCtrl.close();
    this.myMap.setCenter(brand.coordLoc,18);
  }
}
