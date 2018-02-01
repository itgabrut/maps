import {Component, OnInit} from '@angular/core';
import {MenuController, NavController, NavParams} from 'ionic-angular';

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

  location: string;
  myMap:any;

  constructor(public navCtrl: NavController, public navParams: NavParams,public menuCtrl: MenuController) {
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad LocationViewPage');
  }


  ngOnInit(): void {
    this.location = this.navParams.get('location');
  }

  toggleMenu() {
    this.menuCtrl.open()
  }

  getYandex(mapa: any){
    this.myMap = new mapa.Map("YMapsID", {
      center: [55.87, 37.66],
      zoom: 10
    });
  }
}
