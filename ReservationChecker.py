import requests
import json
import datetime

#Wright's Beach reservation url
reservationUrl = "https://www.reservecalifornia.com/Web/#!park/718/706"
apiUrl = "https://calirdr.usedirect.com/RDR/rdr/search/grid"
facility = {"Wright's Beach": "706"}

#Date logic
todaysDate = datetime.datetime.now()

dateList = []

for days in range(10):
    days = days * 30
    dateList.append(todaysDate + datetime.timedelta(days=days))

#Main function
def retrieve_reservations(date):
    # Request
    # POST https://calirdr.usedirect.com/RDR/rdr/search/grid

    try:
        response = requests.post(
            url=apiUrl,
            headers={
                "Content-Type": "application/json; charset=utf-8",
            },
            data=json.dumps({
                "FacilityId": "706",
                "StartDate": date.strftime("%Y-%m-%d")
            })
        )
        # print('Response HTTP Status Code: {status_code}'.format(
        #     status_code=response.status_code))
    except requests.exceptions.RequestException:
        print('HTTP Request failed')
    return response.content

#Checking dates in the future
for date in dateList:
    parkResponse = json.loads(retrieve_reservations(date))
    staySlices = parkResponse['Facility']['Units']['1772.1']['Slices']
    for reservationDate, availability in staySlices.items():
        if availability['IsFree'] == True:
            availableDates = {}
            availableDates.append(reservationDate, availability['IsFree'])
        else:
            pass
            print(f"No availability for {reservationDate}.")

