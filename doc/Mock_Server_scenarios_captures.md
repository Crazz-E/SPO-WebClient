> **Note:** This document contains raw RDO captures from 14 original game interactions.
> Only 9 of these are currently implemented as mock scenarios: auth, world-list, company-list,
> select-company, switch-focus, build-menu, build-roads, mail, building-details.
> Remaining captures are preserved as protocol reference for future implementation.

# 1. Authentification

C 0 idof "DirectoryServer";
A0 objid="39751288";
C 1 sel 39751288 get RDOOpenSession;
A1 RDOOpenSession="#142217260";
C 2 sel 142217260 call RDOMapSegaUser "^" "%SPO_test3";
A2 res="%";
C 3 sel 142217260 call RDOLogonUser "^" "%SPO_test3","%test3";
A3 res="#0";
C 4 sel 142217260 call RDOEndSession "*" ;
A4 ;

# 2. Select region America + Show list of worlds (servers) in the region.

C 5 idof "DirectoryServer";
A5 objid="39751288";
C 7 sel 39751288 get RDOOpenSession;
A7 RDOOpenSession="#166125200";
C 9 sel 166125200 call RDOQueryKey "^" "%Root/Areas/America/Worlds","%General/Population
General/Investors
General/Online
General/Date
Interface/IP
Interface/Port
Interface/URL
Interface/Running
";
A9 res="%Count=3
Key0=shamba
general/date0=2232
general/investors0=21
general/online0=1
general/population0=91982248
interface/ip0=142.44.158.91
interface/port0=8000
interface/running0=true
interface/url0=http://142.44.158.91/Five/
Key1=trinity
general/date1=3412
general/investors1=26
general/online1=1
general/population1=47890344
Key2=zorcon
general/date2=2505
general/investors2=30
general/online2=1
general/population2=34948320
interface/ip2=142.4.193.58
interface/port2=8000
interface/running2=true
interface/url2=http://142.4.193.58/Five/
";
C 11 sel 166125200 call RDOEndSession "*" ;
A11 ;

# 2. (bis) Select region Asia + Show list of worlds (servers) in the region. 

C 13 idof "DirectoryServer";
A13 objid="39751288";
C 14 sel 39751288 get RDOOpenSession;
A14 RDOOpenSession="#137759272";
C 15 sel 137759272 call RDOQueryKey "^" "%Root/Areas/Asia/Worlds","%General/Population
General/Investors
General/Online
General/Date
Interface/IP
Interface/Port
Interface/URL
Interface/Running
";
A15 res="%Count=9
Key0=aries
general/date0=2127
general/investors0=3
general/online0=0
general/population0=6116760
interface/ip0=151.245.54.69
interface/port0=8000
interface/running0=true
interface/url0=http://151.245.54.69/Five/
Key1=basinia
general/date1=2000
general/investors1=0
general/online1=0
general/population1=0
Key2=leonia
general/date2=2514
general/investors2=3
general/online2=0
general/population2=4094860
Key3=pathran
general/date3=2000
general/investors3=2
general/online3=1
general/population3=522
interface/ip3=51.79.39.255
interface/port3=8000
interface/running3=false
interface/url3=http://51.79.39.255/Five/
Key4=shamba
general/date4=2079
general/investors4=4
general/online4=0
general/population4=1081911
interface/ip4=158.69.153.134
interface/port4=8000
interface/running4=true
interface/url4=http://158.69.153.134/Five/
Key5=willow
general/date5=2260
general/investors5=-1
general/online5=0
general/population5=-1
interface/ip5=104.234.200.251
interface/port5=8000
interface/url5=http://104.234.200.251/FIVE/
Key6=xalion
general/date6=2000
general/investors6=2
general/online6=2
general/population6=0
interface/ip6=38.46.142.229
interface/port6=8000
interface/running6=false
interface/url6=http://38.46.142.229/Five/
Key7=zorcon
general/date7=2450
general/investors7=2
general/online7=1
general/population7=753800
interface/ip7=104.234.200.250
interface/port7=8000
interface/running7=false
interface/url7=http://104.234.200.250/Five/
Key8=zyrane
general/date8=2000
general/investors8=1
general/online8=0
general/population8=0
interface/ip8=51.79.39.255
interface/port8=8000
interface/running8=false
interface/url8=http://142.4.193.58/Five/
";
C 16 sel 137759272 call RDOEndSession "*" ;
A16 ;

# 3. Select Server + List companies on the server
First the client sends HTTP request to get the list of companies
GET /Five/0/Visual/Voyager/NewLogon/pleasewait.asp?frame_Id=LogonView&frame_Visibility=hidden&LangId=0

HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Server: Microsoft-IIS/8.5
Set-Cookie: ASPSESSIONIDSABRTDAS=BHPLKGBDAEFJNPMCMIMCKCDB; path=/
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:27 GMT
Content-Length: 395



<html>

<!-- Headers -->

<head>
	<title> Company List </title>
	
		<link rel="STYLESHEET" href="logon.css" type="text/css">
	
</head>

<!-- Body -->

<body style="margin-top: 20px; padding-left: 20px">

<div id=allStuff style="display: none">
	<font size=2>PLEASE WAIT</p>If this page doesn't clear please try to join the planet again!</font>
</div>

</body>

</html>

GET /Five/0/Visual/Voyager/NewLogon/logonComplete.asp?frame_Id=LogonView&frame_Class=HTMLView&frame_Align=client&ResultType=NORMAL&Logon=FALSE&frame_NoBorder=True&frame_NoScrollBars=true&ClientViewId=8161308&WorldName=Shamba&UserName=SPO_test3&DSAddr=dir.starpeaceonline.com&DSPort=1111&ISAddr=158.69.153.134&ISPort=8000&LangId=0

HTTP/1.1 302 Object moved
Cache-Control: private
Content-Type: text/html
Location: chooseCompany.asp?ClientViewId=8161308&PA=&Ooopsy=0&WorldName=Shamba&UserName=SPO_test3&Logon=FALSE&ISAddr=158.69.153.134&ISPort=8000
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:31 GMT
Content-Length: 278

<head><title>Object moved</title></head>
<body><h1>Object Moved</h1>This object may be found <a HREF="chooseCompany.asp?ClientViewId=8161308&amp;PA=&amp;Ooopsy=0&amp;WorldName=Shamba&amp;UserName=SPO_test3&amp;Logon=FALSE&amp;ISAddr=158.69.153.134&amp;ISPort=8000">here</a>.</body>

GET /Five/0/Visual/Voyager/NewLogon/chooseCompany.asp?ClientViewId=8161308&PA=&Ooopsy=0&WorldName=Shamba&UserName=SPO_test3&Logon=FALSE&ISAddr=158.69.153.134&ISPort=8000

HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Expires: Wed, 18 Feb 2026 21:21:31 GMT
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:31 GMT
Content-Length: 4701



<html>

<!-- Headers -->

<head>
	<title> Company List </title>
	
		<link rel="STYLESHEET" href="../voyager.css" type="text/css">
	
</head>


<!-- Scripts -->

<script language="JScript" src="../includes/FrameButtons.js">
</script>


<script language="JScript">

	function getBaseURL()
	{
		return ("http://" + 
		 		"158.69.153.134:80" + "/" + 
		 		"/Five/0/Visual/Voyager/NewLogon/");
	
	}

</script>



<script language="JScript">

	var firstClick = true;

	function onCompClick()
	{
		if (event.srcElement.tagName != "A")
		{
			var td = getCell( event.srcElement );
			if (td != null && td.tagName == "TD")
				//window.navigate( "http://local.asp?frame_Action=SetCompany&frame_Id=CnxHandler&Name=" + td.companyName + "&OwnerRole=" + td.companyOwnerRole + "&Id=" + td.companyId  + "::http://local.asp?frame_Id=WebMain&frame_Close=yes"  );
				window.navigate( "http://local.asp?frame_Action=SetCompany&frame_Id=CnxHandler&Name=" + td.companyName + "&OwnerRole=" + td.companyOwnerRole + "&Id=" + td.companyId  + "::http://local.asp?frame_Id=TycoonOpt&frame_Close=yes"  );



		}
	}

	function onBtnClick()
	{
		if (event.srcElement.tagName != "A")
		{
			var td = getCell( event.srcElement );
			if (td != null && td.tagName == "TD")
				switch (td.command)
				{
					case "cancel" :
						window.navigate( "logon.asp?WorldName=Shamba&ISAddr=158.69.153.134&ISPort=8000" )
					break;
					case "createnew" :
						if (firstClick)
						{
							firstClick = false;
							window.navigate( "NewCompWarning.asp?ClientViewId=8161308&WorldName=Shamba&UserName=SPO_test3&ISAddr=158.69.153.134&ISPort=8000&Logon=FALSE" );
						}
						else
						{
							alert("Please wait!");
						}
						//window.navigate( "NewCompWarning.asp?UserName=&ClientViewId=8161308&WorldName=Shamba&ISAddr=158.69.153.134&ISPort=8000" )
					break;
					case "help" :
						alert( "Help is under construction!" )
					break;
				}
		}
	}

	function onPageLoad()
	{
		allStuff.style.display = "inline";
		
	}

</script>


<!-- Body -->
<style type"text/css">
.center {
 display: block;
 margin-left: auto;
 margin-right: auto;
 width: 150px;
 }
</style>
<body style="margin-top: 20px; padding-left: 20px" onLoad="onPageLoad()">
<div style="text-align: center">
<img src="images/starpeace_new_logo.png" class="center" />
<p style="font-size: 16px;color: orange;">Please Note: Its easy to go past this point without having read the code of conduct on the DISCORD, <a href="https://discord.gg/22SMSseQuG" target="_blank" style="font-size: 18px;font-weight: bold;">HERE</a></p>
<p style="font-size: 14px;color: orange;font-align: justify">This is a Sandman server, if you wish to play here please speak to Game Operator to obtain authorization.<br/>
</div>
<hr/>
<div id=allStuff style="display: none">
	
		<div class=header2>
			Companies
		</div>
		<div class=value style="margin-left: 20px; margin-top: 10px">
			You have registered the following companies in Shamba.<br>
			Choose one from	the list or create a new one.
		</div>
	

	<div style="margin-top: 25px; text-align: center">
		<table style="padding: 5px">
				<tr>
			
				<tr>
			
					<td align="center" valign="bottom"
						style="border-style: solid; border-width: 2px; border-color: black"
						onMouseOver="onMouseOverFrame()"
						onMouseOut="onMouseOutFrame()"
						onClick="onCompClick()"
						companyOwnerRole="SPO_test3"
						companyName="Yellow Inc."
						companyId="28"
						normColor="black"
						hiColor="#3A5950">

						<img src="images/comp-PGI.gif" style="cursor: hand" border="0">

						<div class=header3>
							Yellow Inc.
						</div>
						<a href="../NewTycoon/CompanyPage.asp?Company=Yellow Inc.&Tycoon=SPO_test3&WorldName=Shamba&DAAddr=&DAPort=&TycoonId=&Password=&CompanyCluster=PGI">more info</a>
						<div class=data>
							
							<nobr> Private </nobr><br>
							
							<nobr> 38 Facilities </nobr><br>
						</div>
					</td>
			
				</tr>
		</table>
		<br><br>
		<table style="text-align: center; margin-right: 40px">
			<tr>
				<!--
				
				

				
				<td>
					<table>
						<tr>
							<td class=button align="center" width="100"
								onMouseOver="onMouseOverFrame()"
								onMouseOut="onMouseOutFrame()"
								onMouseUp="onMouseUp()"
								onMouseDown="onMouseDown()"
								onClick="onBtnClick()"
								command="createnew"
								normColor="#345950"
								hiColor="white">

								Create New!
							</td>
						</tr>
					</table>
				</td>
				
				<!--
				-->
		</table>
	</div>

</div>

</body>

</html>



# 4. Select company 
HTML data

GET /Five/client/cache/maps/Shamba/index.midx HTTP/1.1
User-Agent: FIVEVoyager
Host: 158.69.153.134
Cookie: ASPSESSIONIDSABRTDAS=BHPLKGBDAEFJNPMCMIMCKCDB


HTTP/1.1 404 Not Found
Cache-Control: private
Content-Type: text/html; charset=utf-8
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:32 GMT
Content-Length: 4902

<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"> 
<html xmlns="http://www.w3.org/1999/xhtml"> 
<head> 
<title>IIS 8.5 Detailed Error - 404.0 - Not Found</title> 
<style type="text/css"> 
<!-- 
body{margin:0;font-size:.7em;font-family:Verdana,Arial,Helvetica,sans-serif;} 
code{margin:0;color:#006600;font-size:1.1em;font-weight:bold;} 
.config_source code{font-size:.8em;color:#000000;} 
pre{margin:0;font-size:1.4em;word-wrap:break-word;} 
ul,ol{margin:10px 0 10px 5px;} 
ul.first,ol.first{margin-top:5px;} 
fieldset{padding:0 15px 10px 15px;word-break:break-all;} 
.summary-container fieldset{padding-bottom:5px;margin-top:4px;} 
legend.no-expand-all{padding:2px 15px 4px 10px;margin:0 0 0 -12px;} 
legend{color:#333333;;margin:4px 0 8px -12px;_margin-top:0px; 
font-weight:bold;font-size:1em;} 
a:link,a:visited{color:#007EFF;font-weight:bold;} 
a:hover{text-decoration:none;} 
h1{font-size:2.4em;margin:0;color:#FFF;} 
h2{font-size:1.7em;margin:0;color:#CC0000;} 
h3{font-size:1.4em;margin:10px 0 0 0;color:#CC0000;} 
h4{font-size:1.2em;margin:10px 0 5px 0; 
}#header{width:96%;margin:0 0 0 0;padding:6px 2% 6px 2%;font-family:"trebuchet MS",Verdana,sans-serif; 
 color:#FFF;background-color:#5C87B2; 
}#content{margin:0 0 0 2%;position:relative;} 
.summary-container,.content-container{background:#FFF;width:96%;margin-top:8px;padding:10px;position:relative;} 
.content-container p{margin:0 0 10px 0; 
}#details-left{width:35%;float:left;margin-right:2%; 
}#details-right{width:63%;float:left;overflow:hidden; 
}#server_version{width:96%;_height:1px;min-height:1px;margin:0 0 5px 0;padding:11px 2% 8px 2%;color:#FFFFFF; 
 background-color:#5A7FA5;border-bottom:1px solid #C1CFDD;border-top:1px solid #4A6C8E;font-weight:normal; 
 font-size:1em;color:#FFF;text-align:right; 
}#server_version p{margin:5px 0;} 
table{margin:4px 0 4px 0;width:100%;border:none;} 
td,th{vertical-align:top;padding:3px 0;text-align:left;font-weight:normal;border:none;} 
th{width:30%;text-align:right;padding-right:2%;font-weight:bold;} 
thead th{background-color:#ebebeb;width:25%; 
}#details-right th{width:20%;} 
table tr.alt td,table tr.alt th{} 
.highlight-code{color:#CC0000;font-weight:bold;font-style:italic;} 
.clear{clear:both;} 
.preferred{padding:0 5px 2px 5px;font-weight:normal;background:#006633;color:#FFF;font-size:.8em;} 
--> 
</style> 
 
</head> 
<body> 
<div id="content"> 
<div class="content-container"> 
  <h3>HTTP Error 404.0 - Not Found</h3> 
  <h4>The resource you are looking for has been removed, had its name changed, or is temporarily unavailable.</h4> 
</div> 
<div class="content-container"> 
 <fieldset><h4>Most likely causes:</h4> 
  <ul> 	<li>The directory or file specified does not exist on the Web server.</li> 	<li>The URL contains a typographical error.</li> 	<li>A custom filter or module, such as URLScan, restricts access to the file.</li> </ul> 
 </fieldset> 
</div> 
<div class="content-container"> 
 <fieldset><h4>Things you can try:</h4> 
  <ul> 	<li>Create the content on the Web server.</li> 	<li>Review the browser URL.</li> 	<li>Create a tracing rule to track failed requests for this HTTP status code and see which module is calling SetStatus. For more information about creating a tracing rule for failed requests, click <a href="http://go.microsoft.com/fwlink/?LinkID=66439">here</a>. </li> </ul> 
 </fieldset> 
</div> 
 
<div class="content-container"> 
 <fieldset><h4>Detailed Error Information:</h4> 
  <div id="details-left"> 
   <table border="0" cellpadding="0" cellspacing="0"> 
    <tr class="alt"><th>Module</th><td>&nbsp;&nbsp;&nbsp;IIS Web Core</td></tr> 
    <tr><th>Notification</th><td>&nbsp;&nbsp;&nbsp;MapRequestHandler</td></tr> 
    <tr class="alt"><th>Handler</th><td>&nbsp;&nbsp;&nbsp;StaticFile</td></tr> 
    <tr><th>Error Code</th><td>&nbsp;&nbsp;&nbsp;0x80070002</td></tr> 
     
   </table> 
  </div> 
  <div id="details-right"> 
   <table border="0" cellpadding="0" cellspacing="0"> 
    <tr class="alt"><th>Requested URL</th><td>&nbsp;&nbsp;&nbsp;http://158.69.153.134:80/Five/client/cache/maps/Shamba/index.midx</td></tr> 
    <tr><th>Physical Path</th><td>&nbsp;&nbsp;&nbsp;D:\Inetpub\wwwroot\Five\client\cache\maps\Shamba\index.midx</td></tr> 
    <tr class="alt"><th>Logon Method</th><td>&nbsp;&nbsp;&nbsp;Anonymous</td></tr> 
    <tr><th>Logon User</th><td>&nbsp;&nbsp;&nbsp;Anonymous</td></tr> 
     
   </table> 
   <div class="clear"></div> 
  </div> 
 </fieldset> 
</div> 
 
<div class="content-container"> 
 <fieldset><h4>More Information:</h4> 
  This error means that the file or directory does not exist on the server. Create the file or directory and try the request again. 
  <p><a href="http://go.microsoft.com/fwlink/?LinkID=62293&amp;IIS70Error=404,0,0x80070002,9600">View more information &raquo;</a></p> 
   
 </fieldset> 
</div> 
</div> 
</body> 
</html> 


GET /Five/0/visual/voyager/toolbar/toolbar.asp?WorldName=Shamba&MailAccount=SPO_test3@Shamba.net&Company=Yellow%20Inc.&Tycoon=SPO_test3&Password=test3&DAAddr=158.69.153.134&DAPort=7001&ISAddr=158.69.153.134&ISPort=8000&SecurityId=131655160&Visitor=0&ClientViewId=8161308&frame_Height=100&frame_Id=Toolbar&frame_Align=bottom&LangId=0 HTTP/1.1
Accept: */*
Accept-Language: fr-FR
Accept-Encoding: gzip, deflate
User-Agent: Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.2; WOW64; Trident/7.0; .NET4.0C; .NET4.0E)
Host: 158.69.153.134
Connection: Keep-Alive
Cookie: ASPSESSIONIDSABRTDAS=BHPLKGBDAEFJNPMCMIMCKCDB


HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Expires: Wed, 18 Feb 2026 21:21:33 GMT
Server: Microsoft-IIS/8.5
Set-Cookie: ASPSESSIONIDSAAQQDBT=IIPPKGBDMOEKAPFKEFBKDFOC; path=/
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:32 GMT
Content-Length: 9468



<html>

<head>
<title>FIVE Toolbar</title>
</head>

<!-- Local Styles -->
<style type="text/css">

	.toolImg
	{
		cursor	: hand;
	}

</style>

<!-- Scripts -->
<script language="JScript">

	function onBtnMouseEnter()
	{
		button = event.srcElement;
		if (button.state != "down")
			button.src = "images/hi" + button.imgBase + ".gif";
	}

	function onBtnMouseOut()
	{
		button = event.srcElement;
		if (button.state != "down")
			button.src = "images/" + button.imgBase + ".gif";
	}

	function onBtnMouseDown()
	{
		button = event.srcElement;
		button.src = "images/hi" + button.imgBase + ".gif";
		if (button.btnhref != "")
			window.navigate( button.btnhref );
	}

	function onBtnMouseUp()
	{
		button = event.srcElement;
		if (button.state != "down")
			button.src = "images/hi" + button.imgBase + ".gif";
	}

	function notImplemented()
	{
		alert( "Feature not implemented!" );
	}

</script>


<body style=" background-image: url(images/toolbarbg.jpg); background-color: black; margin-left: 0px; margin-top: 0px; margin-right: 0px">

<table width="100%" cellspacing="0" cellpadding="0">
	<tr>
		<td height="40" align="center" valign="middle">
			<!--
			<img
				class=toolImg
				alt="Go Back in history"
				src="images/back.gif"
				border="0"
				imgBase="back"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				onMouseClick="notImplemented()"
				btnhref="http://local.asp?frame_Id=Master&frame_Action=GoBack">
			<img
				class=toolImg
				alt="Go Forward in history"
				src="images/forward.gif"
				border="0"
				imgBase="forward"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				onMouseClick="notImplemented()"
				btnhref="http://local.asp?frame_Id=Master&frame_Action=GoForward">
			-->
			<img
				class=toolImg
				alt="Refresh all views"
				src="images/refresh.gif"
				border="0"
				imgBase="refresh"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="http://local.asp?frame_Id=Master&frame_Action=Refresh">
			<img
				class=toolImg
				alt="Starpeace Online Home Page"
				src="images/home.gif"
				border="0"
				imgBase="home"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="http://www.starpeaceonline.com?frame_Id=WebMainView&frame_Class=HTMLView&frame_Visibility=switch&frame_Align=client&frame_NoBorder=Yes&frame_ToHistory=yes&InGame=YES&WorldName=Shamba&UserName=SPO_test3">
			
			<img
				class=toolImg
				alt="Display Build menu"
				src="images/build.gif"
				border="0"
				imgBase="build"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="/five/0/visual/voyager/Build/Build.asp?Tycoon=SPO_test3&Company=Yellow Inc.&WorldName=Shamba&frame_Id=BuildView&frame_Visibility=switch&frame_Width=220&frame_KeepContent=yes&frame_ToHistory=yes">
			
			<img
				class=toolImg
				alt="Favorites"
				src="images/fav.gif"
				border="0"
				imgBase="fav"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="?frame_Id=Favorites&frame_Class=Favorites&frame_Align=top&frame_height=95&frame_visibility=switch">
			
			<img
				class=toolImg
				alt="Search the Web"
				src="images/search.gif"
				border="0" imgBase="search"
				state="up"onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="/five/0/visual/voyager/new directory/directory.asp?Tycoon=SPO_test3&Company=Yellow Inc.&WorldName=Shamba&DAAddr=158.69.153.134&DAPort=7001&frame_Id=DirectoryView&frame_Class=HTMLView&frame_Visibility=switch&frame_Align=right&frame_Width=220&frame_NoBorder=Yes&frame_NoScrollBars=No&frame_KeepContent=yes&frame_ToHistory=yes">
			
			<img
				class=toolImg
				alt="User Profile"
				src="images/money.gif"
				border="0"
				imgBase="money"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="/five/0/visual/voyager/newtycoon/tycoonOptions.asp?Tycoon=SPO_test3&Password=test3&Company=Yellow Inc.&WorldName=Shamba&DAAddr=158.69.153.134&DAPort=7001&ISAddr=158.69.153.134&ISPort=8000&frame_Id=TycoonOpt&frame_Class=HTMLView&frame_Visibility=switch&frame_Align=left&frame_NoBorder=Yes&frame_ToHistory=yes&SecurityId=131655160&ClientViewId=8161308&frame_Width=170&frame_NoScrollBars=yes::http://local.asp?frame_Id=MapIsoView&frame_Align=client&frame_ToHistory=yes&frame_Visibility=switch">
			<!--img
				class=toolImg
				alt="User Profile"
				src="images/money.gif"
				border="0"
				imgBase="money"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="http://local.asp?frame_Id=MapIsoView&frame_Align=client&frame_ToHistory=yes&frame_Visibility=switch::/five/0/visual/voyager/newtycoon/tycoonOptions.asp?Tycoon=SPO_test3&Password=test3&Company=Yellow Inc.&WorldName=Shamba&DAAddr=158.69.153.134&DAPort=7001&ISAddr=158.69.153.134&ISPort=8000&frame_Id=TycoonOpt&frame_Class=HTMLView&frame_Visibility=switch&frame_Align=left&frame_NoBorder=Yes&frame_ToHistory=yes&SecurityId=131655160&ClientViewId=8161308&frame_Width=170&frame_NoScrollBars=yes"-->
			
			<img
				class=toolImg
				alt="Map view"
				src="images/map.gif"
				border="0"
				imgBase="map"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="http://local.asp?frame_Id=MapIsoView&frame_Align=client&frame_ToHistory=yes">
			<img
				class=toolImg
				alt="Universe View"
				src="images/stellarmap.gif"
				border="0"
				imgBase="stellarmap"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="http://local.asp?frame_Id=UniverseMap&frame_Class=UniversalMapHandler&frame_Align=left&Logon=false&frame_Visibility=switch">
			<img
				class=toolImg
				alt="Mail"
				src="images/mail.gif"
				border="0"
				imgBase="mail"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="/five/0/visual/voyager/mail/MailFolder.asp?Folder=Inbox&WorldName=Shamba&Tycoon=SPO_test3&Account=SPO_test3@Shamba.net&Password=test3&frame_Id=MailView&frame_Class=HTMLView&frame_Align=bottom&frame_Height=40%&frame_KeepContent=no&frame_ToHistory=yes">
			<img
				class=toolImg
				alt="Chat"
				src="images/chat.gif"
				border="0"
				imgBase="chat"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="http://local?frame_Action=Create&frame_Id=ChatListHandler&frame_Class=ChatListHandler&frame_Align=right&frame_Width=150&frame_Visibility=switch&frame_ToHistory=yes">
			<img
				class=toolImg
				alt="Options"
				src="images/options.gif"
				border="0"
				imgBase="options"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="local.asp?frame_Id=OptionsView&frame_Class=OptionsView&frame_Align=top&frame_Width=100%&frame_Height=114&frame_Visibility=switch&frame_NoBorder=Yes&frame_KeepContent=yes">
			<!--img
				class=toolImg
				alt="Call GMs for Help"
				src="images/help.gif"
				border="0"
				imgBase="help"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="http://local.asp?frame_Id=GMChat&frame_Class=GMChatHandler&frame_Align=top&frame_Height=110&frame_Visibility=switch"-->
			<img
				class=toolImg
				alt="Support"
				src="images/help.gif"
				border="0"
				imgBase="help"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="http://www.starpeaceonline.com/support.asp?frame_Id=WebMainView&frame_Class=HTMLView&frame_Visibility=switch&frame_Align=client&frame_NoBorder=Yes&frame_ToHistory=yes&InGame=YES&WorldName=Shamba&UserName=SPO_test3">
			<!--img
				class=toolImg
				alt="Call GMs for Help"
				src="images/help.gif"
				border="0"
				imgBase="help"
				state="up"
				onMouseOver="onBtnMouseEnter()"
				onMouseOut="onBtnMouseOut()"
				onMouseDown="onBtnMouseDown()"
				onMouseUp="onBtnMouseUp()"
				btnhref="http://local.asp?frame_Id=GMChat&frame_Class=GMChatHandler&frame_Align=top&frame_Height=110&frame_Visibility=switch"-->
		</td>
	</tr>
</table>

</body>

</html>

GET /Five/0/0/Visual/Voyager/NewLogon/pleasewait.asp?frame_Id=LogonView&frame_Visibility=hidden&LangId=0 HTTP/1.1
Accept: image/gif, image/jpeg, image/pjpeg, application/x-ms-application, application/xaml+xml, application/x-ms-xbap, */*
Accept-Language: fr-FR
Accept-Encoding: gzip, deflate
User-Agent: Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.2; WOW64; Trident/7.0; .NET4.0C; .NET4.0E)
Host: 158.69.153.134
Connection: Keep-Alive
Cookie: ASPSESSIONIDSABRTDAS=BHPLKGBDAEFJNPMCMIMCKCDB; ASPSESSIONIDSAAQQDBT=IIPPKGBDMOEKAPFKEFBKDFOC


HTTP/1.1 404 Not Found
Cache-Control: private
Content-Type: text/html; charset=utf-8
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:37 GMT
Content-Length: 4976

<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"> 
<html xmlns="http://www.w3.org/1999/xhtml"> 
<head> 
<title>IIS 8.5 Detailed Error - 404.0 - Not Found</title> 
<style type="text/css"> 
<!-- 
body{margin:0;font-size:.7em;font-family:Verdana,Arial,Helvetica,sans-serif;} 
code{margin:0;color:#006600;font-size:1.1em;font-weight:bold;} 
.config_source code{font-size:.8em;color:#000000;} 
pre{margin:0;font-size:1.4em;word-wrap:break-word;} 
ul,ol{margin:10px 0 10px 5px;} 
ul.first,ol.first{margin-top:5px;} 
fieldset{padding:0 15px 10px 15px;word-break:break-all;} 
.summary-container fieldset{padding-bottom:5px;margin-top:4px;} 
legend.no-expand-all{padding:2px 15px 4px 10px;margin:0 0 0 -12px;} 
legend{color:#333333;;margin:4px 0 8px -12px;_margin-top:0px; 
font-weight:bold;font-size:1em;} 
a:link,a:visited{color:#007EFF;font-weight:bold;} 
a:hover{text-decoration:none;} 
h1{font-size:2.4em;margin:0;color:#FFF;} 
h2{font-size:1.7em;margin:0;color:#CC0000;} 
h3{font-size:1.4em;margin:10px 0 0 0;color:#CC0000;} 
h4{font-size:1.2em;margin:10px 0 5px 0; 
}#header{width:96%;margin:0 0 0 0;padding:6px 2% 6px 2%;font-family:"trebuchet MS",Verdana,sans-serif; 
 color:#FFF;background-color:#5C87B2; 
}#content{margin:0 0 0 2%;position:relative;} 
.summary-container,.content-container{background:#FFF;width:96%;margin-top:8px;padding:10px;position:relative;} 
.content-container p{margin:0 0 10px 0; 
}#details-left{width:35%;float:left;margin-right:2%; 
}#details-right{width:63%;float:left;overflow:hidden; 
}#server_version{width:96%;_height:1px;min-height:1px;margin:0 0 5px 0;padding:11px 2% 8px 2%;color:#FFFFFF; 
 background-color:#5A7FA5;border-bottom:1px solid #C1CFDD;border-top:1px solid #4A6C8E;font-weight:normal; 
 font-size:1em;color:#FFF;text-align:right; 
}#server_version p{margin:5px 0;} 
table{margin:4px 0 4px 0;width:100%;border:none;} 
td,th{vertical-align:top;padding:3px 0;text-align:left;font-weight:normal;border:none;} 
th{width:30%;text-align:right;padding-right:2%;font-weight:bold;} 
thead th{background-color:#ebebeb;width:25%; 
}#details-right th{width:20%;} 
table tr.alt td,table tr.alt th{} 
.highlight-code{color:#CC0000;font-weight:bold;font-style:italic;} 
.clear{clear:both;} 
.preferred{padding:0 5px 2px 5px;font-weight:normal;background:#006633;color:#FFF;font-size:.8em;} 
--> 
</style> 
 
</head> 
<body> 
<div id="content"> 
<div class="content-container"> 
  <h3>HTTP Error 404.0 - Not Found</h3> 
  <h4>The resource you are looking for has been removed, had its name changed, or is temporarily unavailable.</h4> 
</div> 
<div class="content-container"> 
 <fieldset><h4>Most likely causes:</h4> 
  <ul> 	<li>The directory or file specified does not exist on the Web server.</li> 	<li>The URL contains a typographical error.</li> 	<li>A custom filter or module, such as URLScan, restricts access to the file.</li> </ul> 
 </fieldset> 
</div> 
<div class="content-container"> 
 <fieldset><h4>Things you can try:</h4> 
  <ul> 	<li>Create the content on the Web server.</li> 	<li>Review the browser URL.</li> 	<li>Create a tracing rule to track failed requests for this HTTP status code and see which module is calling SetStatus. For more information about creating a tracing rule for failed requests, click <a href="http://go.microsoft.com/fwlink/?LinkID=66439">here</a>. </li> </ul> 
 </fieldset> 
</div> 
 
<div class="content-container"> 
 <fieldset><h4>Detailed Error Information:</h4> 
  <div id="details-left"> 
   <table border="0" cellpadding="0" cellspacing="0"> 
    <tr class="alt"><th>Module</th><td>&nbsp;&nbsp;&nbsp;IIS Web Core</td></tr> 
    <tr><th>Notification</th><td>&nbsp;&nbsp;&nbsp;MapRequestHandler</td></tr> 
    <tr class="alt"><th>Handler</th><td>&nbsp;&nbsp;&nbsp;ASPClassic</td></tr> 
    <tr><th>Error Code</th><td>&nbsp;&nbsp;&nbsp;0x80070002</td></tr> 
     
   </table> 
  </div> 
  <div id="details-right"> 
   <table border="0" cellpadding="0" cellspacing="0"> 
    <tr class="alt"><th>Requested URL</th><td>&nbsp;&nbsp;&nbsp;http://158.69.153.134:80/Five/0/0/Visual/Voyager/NewLogon/pleasewait.asp?frame_Id=LogonView&amp;frame_Visibility=hidden&amp;LangId=0</td></tr> 
    <tr><th>Physical Path</th><td>&nbsp;&nbsp;&nbsp;D:\Inetpub\wwwroot\Five\0\0\Visual\Voyager\NewLogon\pleasewait.asp</td></tr> 
    <tr class="alt"><th>Logon Method</th><td>&nbsp;&nbsp;&nbsp;Anonymous</td></tr> 
    <tr><th>Logon User</th><td>&nbsp;&nbsp;&nbsp;Anonymous</td></tr> 
     
   </table> 
   <div class="clear"></div> 
  </div> 
 </fieldset> 
</div> 
 
<div class="content-container"> 
 <fieldset><h4>More Information:</h4> 
  This error means that the file or directory does not exist on the server. Create the file or directory and try the request again. 
  <p><a href="http://go.microsoft.com/fwlink/?LinkID=62293&amp;IIS70Error=404,0,0x80070002,9600">View more information &raquo;</a></p> 
   
 </fieldset> 
</div> 
</div> 
</body> 
</html> 

GET /Five/0/visual/voyager/toolbar/images/hibuild.gif HTTP/1.1
Accept: */*
Referer: http://158.69.153.134/Five/0/visual/voyager/toolbar/toolbar.asp?WorldName=Shamba&MailAccount=SPO_test3@Shamba.net&Company=Yellow%20Inc.&Tycoon=SPO_test3&Password=test3&DAAddr=158.69.153.134&DAPort=7001&ISAddr=158.69.153.134&ISPort=8000&SecurityId=131655160&Visitor=0&ClientViewId=8161308&frame_Height=100&frame_Id=Toolbar&frame_Align=bottom&LangId=0
Accept-Language: fr-FR
Accept-Encoding: gzip, deflate
User-Agent: Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.2; WOW64; Trident/7.0; .NET4.0C; .NET4.0E)
Host: 158.69.153.134
Connection: Keep-Alive
Cookie: ASPSESSIONIDSABRTDAS=BHPLKGBDAEFJNPMCMIMCKCDB; ASPSESSIONIDSAAQQDBT=IIPPKGBDMOEKAPFKEFBKDFOC


HTTP/1.1 200 OK
Content-Type: image/gif
Last-Modified: Sat, 01 Mar 2003 20:01:06 GMT
Accept-Ranges: bytes
ETag: "06d394b2de0c21:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:51 GMT
Content-Length: 287

GIF89a'. ....{...........9B?X`](2/. .!..	....,....'. ....x...0.I..8.MK	....Hp..
....7.....a.q	.?BmrS
...n..
()P`@...9$.Y..
...V.L...w.2,...h.vk...[`..%zubi'$.#"t+...Bf+!./.m.<?E....|.4...4`!..UV'..3`.y{.1.....u..*........
....[..............;......7..3.o...?4I...._C.
.7.@&...f....
t...;

] <-- ignore this character, it's to respect MD syntax.


Followed by RDO data
C 34 sel 8161308 set EnableEvents="#-1";
A34 ;
C 35 sel 8161308 call PickEvent "^" "#22";
A35 res="%";
C 36 sel 8161308 call GetTycoonCookie "^" "#22","%LastY.0";
A36 res="%395";
C 37 sel 8161308 call GetTycoonCookie "^" "#22","%LastX.0";
A37 res="%467";
C 38 sel 8161308 call GetTycoonCookie "^" "#22","%";
A38 res="%LastX.0=467
LastY.0=395
LastTimeOnline=2026-02-18
";
C 39 sel 8161308 call PickEvent "^" "#22";
A39 res="%";
C 40 sel 8161308 get ServerBusy;
A40 ServerBusy="#0";
C 41 sel 8161308 call PickEvent "^" "#22";
A41 res="%";
C 42 sel 8161308 call PickEvent "^" "#22";
A42 res="%";
C 43 sel 8161308 get ServerBusy;
A43 ServerBusy="#0";
C 44 sel 8161308 call PickEvent "^" "#22";
A44 res="%";
C 45 sel 8161308 call PickEvent "^" "#22";
A45 res="%";
C 46 sel 8161308 call PickEvent "^" "#22";
A46 res="%";
C 47 sel 8161308 call PickEvent "^" "#22";
A47 res="%";
C 48 sel 8161308 call PickEvent "^" "#22";
A48 res="%";
C 49 sel 8161308 call PickEvent "^" "#22";
A49 res="%";
C 50 sel 8161308 get ServerBusy;
A50 ServerBusy="#0";C sel 40133496 call RefreshTycoon "*" "%4666201923","%10359","#2","#33","#70";
C 51 sel 8161308 get ServerBusy;
A51 ServerBusy="#0";
C sel 8161308 call ClientAware "*" ;
C sel 40133496 call ChatMsg "*" "%SYSTEM","%SPO_test3 has entered Shamba";
C 52 sel 8161308 call GetTycoonCookie "^" "#22","%";C sel 8161308 call ClientAware "*" ;
A52 res="%LastX.0=467
LastY.0=395
LastTimeOnline=2026-02-18
";


# 5. SegmentsinArea & ObjectsInArea (RDO)

C 53 sel 8161308 call ObjectsInArea "^" "#384","#384","#64","#64";
A53 res="%";
C 54 sel 8161308 get ServerBusy;
A54 ServerBusy="#0";
C sel 8161308 call SetViewedArea "*" "#426","#355","#81","#81";C sel 8161308 call MsgCompositionChanged "*" "#0";C sel 8161308 call SetViewedArea "*" "#426","#355","#81","#81";C 55 sel 8161308 call SegmentsInArea "^" "#1","#383","#383","#449","#449";
C sel 40133496 call NotifyMsgCompositionState "*" "%SPO_test3","#0";A55 res="%448
384
448
391
23
22
0
0
0
0
448
391
448
398
22
23
0
0
0
0
441
391
448
391
22
22
0
0
0
0
441
391
441
398
22
23
0
0
0
0
434
391
441
391
21
22
0
0
0
0
434
391
434
405
21
23
0
0
0
0
427
405
434
405
23
23
0
0
0
0
434
405
441
405
23
24
0
0
0
0
413
391
427
391
21
21
0
0
0
0
427
391
434
391
21
21
0
0
0
0
427
391
427
405
21
23
0
0
0
0
420
405
427
405
23
23
0
0
0
0
413
377
413
391
23
21
0
0
0
0
413
391
413
412
21
23
0
0
0
0
406
412
413
412
23
23
-1
0
0
0
413
412
420
412
23
24
0
0
0
0
448
391
462
391
22
9
0
0
0
0
448
419
462
419
26
13
0
0
0
0
448
426
462
426
27
14
0
0
0
0
448
419
448
426
26
27
0
0
0
0
441
440
448
440
28
28
0
0
0
0
448
440
462
440
28
15
0
0
0
0
448
426
448
440
27
28
0
0
0
0
448
440
448
447
28
29
0
0
0
0
";
C 56 sel 8161308 call ObjectsInArea "^" "#448","#320","#64","#64";
A56 res="%";
C 57 sel 8161308 call SegmentsInArea "^" "#1","#447","#319","#513","#385";
A57 res="%476
384
476
391
-7
-8
0
0
0
0
483
384
483
391
-5
-6
0
0
0
0
490
377
490
391
0
-4
0
0
0
0
483
377
490
377
-3
0
0
0
0
0
490
377
497
377
0
2
0
0
0
0
497
377
497
391
2
-1
0
0
0
0
504
370
504
377
7
5
0
0
0
0
504
377
504
391
5
1
0
0
0
0
497
377
504
377
2
5
0
0
0
0
504
377
511
377
5
7
0
0
0
0
497
370
504
370
4
7
0
0
0
0
504
370
511
370
7
9
0
0
0
0
448
384
448
391
23
22
0
0
0
0
462
377
462
391
12
9
0
0
0
0
";
C 58 sel 8161308 call ObjectsInArea "^" "#448","#384","#64","#64";
A58 res="%6031
0
16
458
392
4702
22
17
459
389
4752
22
17
461
390
4510
0
16
463
389
4500
11
16
463
392
4116
22
17
472
392
4702
22
17
477
392";
C 59 sel 8161308 call SegmentsInArea "^" "#1","#447","#383","#513","#449";
A59 res="%476
384
476
391
-7
-8
0
0
0
0
476
391
476
398
-8
-8
0
0
0
0
476
391
483
391
-8
-6
0
0
0
0
483
384
483
391
-5
-6
0
0
0
0
483
391
483
398
-6
-6
0
0
0
0
483
391
490
391
-6
-4
0
0
0
0
490
377
490
391
0
-4
0
0
0
0
490
391
490
405
-4
-3
0
0
0
0
483
405
490
405
-5
-3
0
0
0
0
490
405
497
405
-3
-1
0
0
0
0
490
391
497
391
-4
-1
0
0
0
0
497
377
497
391
2
-1
0
0
0
0
497
391
497
405
-1
-1
0
0
0
0
497
405
504
405
-1
2
0
0
0
0
497
391
504
391
-1
1
0
0
0
0
504
391
511
391
1
3
0
0
0
0
504
377
504
391
5
1
0
0
0
0
504
391
504
405
1
2
0
0
0
0
504
405
504
412
2
2
0
0
0
0
504
405
511
405
2
4
0
0
0
0
497
412
504
412
0
2
0
0
0
0
504
412
511
412
2
4
0
0
0
0
448
384
448
391
23
22
0
0
0
0
448
391
448
398
22
23
0
0
0
0
441
391
448
391
22
22
0
0
0
0
448
391
462
391
22
9
0
0
0
0
462
391
476
391
9
-8
0
0
0
0
462
377
462
391
12
9
0
0
0
0
462
391
462
405
9
11
0
0
0
0
455
405
462
405
23
11
0
0
0
0
462
405
469
405
11
-3
0
0
0
0
462
405
462
412
11
12
0
0
0
0
455
412
462
412
24
12
0
0
0
0
462
412
469
412
12
-2
0
0
0
0
462
412
462
419
12
13
0
0
0
0
448
419
462
419
26
13
0
0
0
0
462
419
476
419
13
-6
0
0
0
0
462
419
462
426
13
14
0
0
0
0
462
426
462
440
14
15
0
0
0
0
448
426
462
426
27
14
0
0
0
0
448
419
448
426
26
27
0
0
0
0
462
426
476
426
14
-5
0
0
0
0
441
440
448
440
28
28
0
0
0
0
448
440
462
440
28
15
0
0
0
0
448
426
448
440
27
28
0
0
0
0
448
440
448
447
28
29
0
0
0
0
462
440
483
440
15
-2
0
0
0
0
483
433
483
440
-3
-2
0
0
0
0
483
440
483
447
-2
-2
0
0
0
0
";
C 60 sel 8161308 call ObjectsInArea "^" "#384","#320","#64","#64";
A60 res="%";
C 61 sel 8161308 call SegmentsInArea "^" "#1","#383","#319","#449","#385";
A61 res="%448
384
448
391
23
22
0
0
0
0
413
370
413
377
23
23
0
0
0
0
413
377
413
391
23
21
0
0
0
0
406
377
413
377
22
23
-1
0
0
0
406
370
413
370
23
23
-1
0
0
0
";
C 62 sel 8161308 get ServerBusy;
A62 ServerBusy="#0";
C 63 sel 8161308 get ServerBusy;
A63 ServerBusy="#0";
C 64 sel 8161308 get ServerBusy;
C sel 40133496 call RefreshArea "*" "#458","#392","#4","#4","%1:6032
0
16
458
392:462
391
462
405
9
11
0
0
0
0
:";C sel 40133496 call RefreshTycoon "*" "%4666222933","%10368","#2","#33","#70";
C 65 sel 8161308 call ObjectsInArea "^" "#458","#392","#5","#5";
A64 ServerBusy="#0";A65 res="%6032
0
16
458
392
4500
11
16
463
392";
C 66 sel 8161308 call SegmentsInArea "^" "#1","#457","#391","#464","#398";
A66 res="%448
391
462
391
22
9
0
0
0
0
462
391
476
391
9
-8
0
0
0
0
462
377
462
391
12
9
0
0
0
0
462
391
462
405
9
11
0
0
0
0
";

# 6. ServerBusy
C 67 sel 8161308 get ServerBusy;
A67 ServerBusy="#0";

# 7. SwitchFocusEx 
C 68 sel 8161308 call SwitchFocusEx "^" "#0","#472","#392";
A68 res="%127706280
Farm 10

Yellow Inc.

Hiring workforce at 39%

(-$29/h):-:Upgrade Level: 1  Professionals: 1 of 1.Workers: 9 of 27.:-:Warning: This facility needs Low class work force.:-:";

C 72 sel 8161308 call SwitchFocusEx "^" "#127706280","#477","#392";
A72 res="%127839460
10

Yellow Inc.

Pharmaceutics sales at 1%

(-$36/h):-:Drug Store.  Upgrade Level: 1  Items Sold: 1/h  Potential customers (per day): 0 hi, 1 mid, 1 low. Actual customers: 0 hi, 1 mid, 1 low.  Efficiency: 87%  Desirability: 46:-:Hint: Try to attract more customers by offering better quality and prices.:-:";

# 8. Push server : RefreshObject (Only when a SwitchFocusEx is active.)

C sel 40133496 call RefreshObject "*" "#127839460","#0","%10

Yellow Inc.

Pharmaceutics sales at 1%

(-$36/h):-:Drug Store.  Upgrade Level: 1  Items Sold: 1/h  Potential customers (per day): 0 hi, 1 mid, 1 low. Actual customers: 0 hi, 1 mid, 1 low.  Efficiency: 87%  Desirability: 46:-:Hint: Try to attract more customers by offering better quality and prices.:-:";C sel 40133496 call RefreshTycoon "*" "%4666243913","%10508","#2","#33","#70";


# 9. SetViewedArea sent by client
C sel 8161308 call SetViewedArea "*" "#423","#353","#81","#80";

# 10. PickEvent

C 81 sel 8161308 call PickEvent "^" "#22";
A81 res="%";

# 11. OVERLAYS : GetSurface 

C 95 sel 8161308 call GetSurface "^" "%ZONES","#384","#384","#448","#448";
A95 res="%65:65:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:";
C 96 sel 8161308 call GetSurface "^" "%ZONES","#448","#384","#512","#448";
A96 res="%65:65:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:0=65,:";


# 12. Build Menu + call NewFacility

GET /Five/0/visual/voyager/toolbar/images/hibuild.gif
Referer: http://158.69.153.134/Five/0/visual/voyager/toolbar/toolbar.asp?WorldName=Shamba&MailAccount=SPO_test3@Shamba.net&Company=Yellow%20Inc.&Tycoon=SPO_test3&Password=test3&DAAddr=158.69.153.134&DAPort=7001&ISAddr=158.69.153.134&ISPort=8000&SecurityId=131655160&Visitor=0&ClientViewId=8161308&frame_Height=100&frame_Id=Toolbar&frame_Align=bottom&LangId=0

HTTP/1.1 200 OK
Content-Type: image/gif
Last-Modified: Sat, 01 Mar 2003 20:01:06 GMT
Accept-Ranges: bytes
ETag: "06d394b2de0c21:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:51 GMT
Content-Length: 287

GIF89a'. ....{...........9B?X`](2/. .!..	....,....'. ....x...0.I..8.MK	....Hp..
....7.....a.q	.?BmrS
...n..
()P`@...9$.Y..
...V.L...w.2,...h.vk...[`..%zubi'$.#"t+...Bf+!./.m.<?E....|.4...4`!..UV'..3`.y{.1.....u..*........
....[..............;......7..3.o...?4I...._C.
.7.@&...f....
t...;

GET /five/0/visual/voyager/Build/Build.asp?Tycoon=SPO_test3&Company=Yellow%20Inc.&WorldName=Shamba&frame_Id=BuildView&frame_Visibility=switch&frame_Width=220&frame_KeepContent=yes&frame_ToHistory=yes&LangId=0
HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Expires: Wed, 18 Feb 2026 21:21:53 GMT
Server: Microsoft-IIS/8.5
Set-Cookie: ASPSESSIONIDSABSRCAT=KMPJLGBDEPBGFAGGEBPEELJL; path=/
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:53 GMT
Content-Length: 481



<!-- Head -->

<head>
	<title>	Build </title>
</head>


<!-- FrameSet -->

<frameset framespacing="0" rows="95,*">>
	<frame name="Top"  src="BuildTop.asp?Company=Yellow Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3" scrolling="no" noresize frameborder = "No" marginwidth="0" marginheight="0">
	<frame name="Main" src="KindList.asp?Company=Yellow Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3" noresize frameborder = "No"  marginwidth="0" marginheight="0">
</frameset>

GET /five/0/visual/voyager/Build/BuildTop.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3
Referer: http://158.69.153.134/five/0/visual/voyager/Build/Build.asp?Tycoon=SPO_test3&Company=Yellow%20Inc.&WorldName=Shamba&frame_Id=BuildView&frame_Visibility=switch&frame_Width=220&frame_KeepContent=yes&frame_ToHistory=yes&LangId=0

HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Expires: Wed, 18 Feb 2026 21:21:53 GMT
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:53 GMT
Content-Length: 2323



<!-- Head -->

<head>
	<title>	Build </title>
	<link rel="STYLESHEET" href="../voyager.css" type="text/css">
</head>


<!-- Scripts -->

<script language="JScript" src="../includes/FrameButtons.js">
</script>

<script language="JScript">


	function onBtnClick()
	{
		var td = getCell( event.srcElement );
		if (td != null && td.tagName == "TD")
			switch (td.command)
			{
				case "back" :
					window.parent.frames["Main"].navigate( "KindList.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3" )
				break;
				case "home" :
					window.parent.frames["Main"].navigate( "KindList.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3" )
				break;
			}
	}


</script>

<!-- Body -->

<body style="background-image: url(images/topgradient.jpg)">
	<table width="100%" cellspacing="0">
		<tr>
			<td valign="middle" style="padding-top: 4px; padding-left: 5px">
				<a href="http://local.asp?frame_Id=BuildView&frame_Close=yes">
					<img src="images/buildicon.gif" border="0">
				</a>
			</td>
			<td width=100% valign="middle" style="padding-left: 4px">
				<div class=sectionTitle style="margin-top: 20px">
					Build
				</div>
				<table width="80% "style="text-align: center; margin-right: 40px">
					<tr>
						<td>
							<table>
								<tr>
									<td class=button align="center" width="100"
										onMouseOver="onMouseOverFrame()"
										onMouseOut="onMouseOutFrame()"
										onMouseUp="onMouseUp()"
										onMouseDown="onMouseDown()"
										onClick="onBtnClick()"
										command="back"
										normColor="#345950"
										hiColor="white">

										Back
									</td>
								</tr>
							</table>
						</td>
						<td width="0">
						</td>
						<td>
							<table>
								<tr>
									<td class=button align="center" width="100"
										onMouseOver="onMouseOverFrame()"
										onMouseOut="onMouseOutFrame()"
										onMouseUp="onMouseUp()"
										onMouseDown="onMouseDown()"
										onClick="onBtnClick()"
										command="home"
										normColor="#345950"
										hiColor="white">

										Home
									</td>
								</tr>
							</table>
						</td>
						<td width="0">
						</td>
				</table>
			</td>
		</tr>
	</table>
</body>

GET /five/0/visual/voyager/voyager.css
Referer: http://158.69.153.134/five/0/visual/voyager/Build/BuildTop.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3
HTTP/1.1 200 OK
Content-Type: text/css
Last-Modified: Sat, 01 Mar 2003 20:00:16 GMT
Accept-Ranges: bytes
ETag: "086c2d2de0c21:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:53 GMT
Content-Length: 6548

BODY
{
    BACKGROUND-COLOR: black;
    COLOR: white;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 5pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal;
    MARGIN-LEFT: 0px;
    MARGIN-RIGHT: 0px;
    MARGIN-TOP: 0px
	scrollbar-3dlight-color: #345950; 
	scrollbar-arrow-color: #547970; 
	scrollbar-base-color: #345950;
	scrollbar-darkshadow-color: #345950; 
	scrollbar-face-color: black;
	scrollbar-highlight-color: #345950; 
	scrollbar-shadow-color: #345950; 

}
.sectionTitle
{
    COLOR: #eeeecc;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 15pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold
}
.smallDescription
{
    COLOR: #ff9900;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 7pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal
}
.description
{
    COLOR: #ff9900;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 9pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal
}
.listItem
{
    COLOR: #fff8dc;
    CURSOR: hand;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 8pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal
}
.comment
{
    COLOR: #ff9900;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 10pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold
}
.link
{
    COLOR: #ff9900;
    CURSOR: hand;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 8pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold;
    TEXT-DECORATION: none
}
.highlightedLink
{
    COLOR: white;
    CURSOR: hand;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 8pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold;
    TEXT-DECORATION: none
}
.disabledLink
{
    COLOR: #552200;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 8pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold;
    TEXT-DECORATION: none
}
.inputLabel
{
    COLOR: white;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 11pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold
}
.label
{
    COLOR: #749990;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 10pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal
}
.smallLabel
{
    COLOR: #ff9900;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 7pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal
}
.value
{
    COLOR: white;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 10pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal
}
.data
{
    COLOR: white;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 10pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal
}
.button
{
    BORDER-BOTTOM: #345950 solid 1px;
    BORDER-LEFT: #345950 solid 1px;
    BORDER-RIGHT: #345950 solid 1px;
    BORDER-TOP: #345950 solid 1px;
    COLOR: white;
    CURSOR: hand;
    FONT-FAMILY: Arial;
    FONT-SIZE: 8pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal;
    MARGIN: 5px;
    PADDING-BOTTOM: 1px;
    PADDING-LEFT: 1px;
    PADDING-RIGHT: 1px;
    PADDING-TOP: 1px;
    TEXT-ALIGN: center
}
.tutorialButton
{
    BORDER-BOTTOM: lime solid 1px;
    BORDER-LEFT: lime solid 1px;
    BORDER-RIGHT: lime solid 1px;
    BORDER-TOP: lime solid 1px;
    COLOR: white;
    CURSOR: hand;
    FONT-FAMILY: Arial;
    FONT-SIZE: 8pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal;
    MARGIN: 10px;
    PADDING-BOTTOM: 1px;
    PADDING-LEFT: 1px;
    PADDING-RIGHT: 1px;
    PADDING-TOP: 1px;
    TEXT-ALIGN: center;
    Background-color: darkgreen;
}
.header1
{
    COLOR: white;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 17pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold
}
.header2
{
    COLOR: #ff9900;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 11pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold
}
.header3
{
    COLOR: #ff9900;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 12pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold
}
.tutorialLink
{
    COLOR: white;
    CURSOR: hand;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 10pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold;
    TEXT-DECORATION: underline;

}
.tutorialNote
{
    TEXT-DECORATION: none;
    COLOR: white;
    CURSOR: normal;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 10pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal;

}
.listHeader
{
    COLOR: #eeeecc;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 9pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold
}
.itemHeader
{
    COLOR: white;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 10pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold
}
.itemInfo
{
    COLOR: #ff9900;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 8pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal
}
A
{
    COLOR: white;
    CURSOR: hand;
    FONT-SIZE: 9pt;
    FONT-STYLE: normal;
    TEXT-DECORATION: underline
}
.mainAnchor
{
    COLOR: #ff9900;
    CURSOR: hand;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 11pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold
}
.toolbarBtn
{
    CURSOR: hand
}
.labelAccountLevel0
{
    COLOR: #94b9b0;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Arial;
    FONT-SIZE: 14pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold
}
.labelAccountLevel1
{
    COLOR: #84a9a0;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Arial;
    FONT-SIZE: 11pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold
}
.labelAccountLevel2
{
    COLOR: #a4c9c0;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Arial;
    FONT-SIZE: 10pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: bold
}
.labelAccountLevel3
{
    COLOR: #749990;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Arial;
    FONT-SIZE: 10pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal
}
.labelAccountLevel4
{
    COLOR: #749990;
    CURSOR: default;
    FONT-FAMILY: Tahoma, Arial;
    FONT-SIZE: 8pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal
}
.disabledItem
{
    COLOR: #94B9B0;
    CURSOR: hand;
    FONT-FAMILY: Tahoma, Verdana, Arial;
    FONT-SIZE: 8pt;
    FONT-STYLE: normal;
    FONT-WEIGHT: normal
}

GET /Five/0/visual/voyager/toolbar/images/hifav.gif
Referer: http://158.69.153.134/Five/0/visual/voyager/toolbar/toolbar.asp?WorldName=Shamba&MailAccount=SPO_test3@Shamba.net&Company=Yellow%20Inc.&Tycoon=SPO_test3&Password=test3&DAAddr=158.69.153.134&DAPort=7001&ISAddr=158.69.153.134&ISPort=8000&SecurityId=131655160&Visitor=0&ClientViewId=8161308&frame_Height=100&frame_Id=Toolbar&frame_Align=bottom&LangId=0

HTTP/1.1 200 OK
Content-Type: image/gif
Last-Modified: Sat, 01 Mar 2003 20:01:06 GMT
Accept-Ranges: bytes
ETag: "06d394b2de0c21:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:53 GMT
Content-Length: 229

GIF89a.. ...................???TTTsss........................!..	....,...... ........H......*\......#J.H..E..
. .q.C.
..T0@@..#=...@.K.	\.\ .a..8q.`x .O......s...
..l0.aO...<.ITA...B.\.....9IN|*.....	.dP....
...8.A..x...........;


GET /five/0/visual/voyager/includes/FrameButtons.js
Referer: http://158.69.153.134/five/0/visual/voyager/Build/BuildTop.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3

HTTP/1.1 200 OK
Content-Type: application/javascript
Last-Modified: Thu, 24 Jul 2008 19:07:15 GMT
Accept-Ranges: bytes
ETag: "2093747cc0edc81:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:53 GMT
Content-Length: 1887


function getRow( element )
{
	if (element.tagName == "TR")
		return element
	else
		if (element.parentElement != null)
			return getRow( element.parentElement )
		else
			return null;
}


function getCell( element )
{
	if (element.tagName == "TD")
		return element
	else
		if (element.parentElement != null)
			return getCell( element.parentElement )
		else
			return null;
}

function onMouseOverFrame()
{
	td = getCell( event.srcElement );
	if (td != null && td.tagName == "TD" && td.hiColor)
	{
		td.style.borderColor = td.hiColor
	}
}


function onMouseOutFrame()
{
	td = getCell( event.srcElement );
	if (td != null && td.tagName == "TD" && td.normColor)
	{
		td.style.borderColor = td.normColor;
		td.style.color = td.hiColor
	}
}

function onMouseUp()
{
	td = getCell( event.srcElement );
	if (td != null && td.tagName == "TD")
	{
		td.style.color = td.hiColor
	}
}


function onMouseDown()
{
	td = getCell( event.srcElement );
	if (td != null && td.tagName == "TD")
	{
		td.style.color = td.normColor
	}
}

function onMouseOverFrame1(ev)
{
	//var ev = window.event;
	var td = getCell((ev.srcElement)?ev.srcElement : ev.target);
	if (td != null && td.tagName == "TD" && td.hiColor)
	{
		td.style.borderColor = td.hiColor
	}
}

function onMouseOutFrame1(ev)
{
	td = getCell((ev.srcElement)?ev.srcElement : ev.target);
	if (td != null && td.tagName == "TD" && td.normColor)
	{
		td.style.borderColor = td.normColor;
		td.style.color = td.hiColor
	}
}

function onMouseUp1(ev)
{
	td = getCell((ev.srcElement)?ev.srcElement : ev.target);
	if (td != null && td.tagName == "TD")
	{
		td.style.color = td.hiColor
	}
}


function onMouseDown1(ev)
{
	td = getCell((ev.srcElement)?ev.srcElement : ev.target);
	if (td != null && td.tagName == "TD")
	{
		td.style.color = td.normColor
	}
}

GET /five/0/visual/voyager/Build/images/BuildRoadDisabled.jpg
Referer: http://158.69.153.134/five/0/visual/voyager/Build/KindList.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3
HTTP/1.1 200 OK
Content-Type: image/jpeg
Last-Modified: Sat, 01 Mar 2003 20:00:16 GMT
Accept-Ranges: bytes
ETag: "086c2d2de0c21:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:53 GMT
Content-Length: 2514

......JFIF.....H.H.....C......................
.....
...
..
...
............................C.......	..	.
.
........................................................<.<..".....................................	
.....................}........!1A..Qa."q.2....#B...R..$3br.	
.....%&'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz.......................................................................................................	
.....................w.......!1..AQ.aq."2...B....	#3R..br.
.$4.%.....&'()*56789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz....................................................................................?..........3..@.zg...Zp.v.5.o..... b....d.......K8......o.Hs...rH...g.{....Z.........3
._..wm^0..c.I'.MD.*....:O.......j/).d"8.t....$......8....}.........q....w'v?.q....}.i...v.....[g.l	..,Qc
.2....P.vg#&....

.....m.A-..<..S&9 tR6.........\.............}:.5..r.I...pq..>.K..wK....gq...y.<rW...._S......]...A...1..Y#.m..%.A.|...../.....:..I..nI.<...nO.$.
...*..	..G)_Z.......m.img.2..$........O.a..0...c.+..).ak.G......0.f.G9.......S^c%..NeD3#..
..~..h..Y...>.Z...t.......ng.....d....k.R.k....W.Z..I8.Qe...U....
...1.r:5x...}.7.....33I.dc....*....	.._N...7.......l..9......!H.$.U..d.e..C5Z<.C...H../..+....Yc`....$..e;r..q......xf.........1....-....I..y.`.J..F.|..o........Avb...L.N.0.*...-.\...W.........].h....HTa.......3....=.x.N........m.vr.s,h[$G.....|d.9~I.
.....H#.....X...#L6...H...6..c.H..8../........v.G.i.g.^.*..Y......T.`
..c.!..<<...>[..Y...2..."..j#..H....'.n[...57;i.1.[.?.dsh.!....|.U\1..^...$.....v..vWI...7C.{.o......?..\^.S...N{..h-m.g.....Gw..T.3..H^..g....
...i.L..z.....g.K.=k...4...:L...e.....s..;/<.9..k..
.R....Z................]...q......TM'..d..%u.P.<J.I.......z..+...WR.>..0.Q......p...1.....<..U.wR..%..-WIg.Y..w4.........;.{b...Z.=.+.q.^.R...(.^ON1.O...~..A._..g!.Y.H6..p..T....[&22.R_x..[;..ht[+F.F...dR3..!....s.P..(...\......s...E..i..U..3\.8P.....0.(..!..w...m......z^..s...M._2X.9.p.1...-..l..PUH..V.......W,.=..p.,HR..Cn...X.. .$.Es.%...op.F.S$...yk.[...d.7`....[..l..G...D...y.+t{.k.t...6H..k(.[ ....kq.I..M.H..X"B........}.._Z.O.>..../-...=..,..X.*.~g$.v..p..k......A.T.O.~3..j$z.e'.........".......&..`.8.d.s.............uK]>.Hp......T.H....'...8.....3).q..x...?.n.;EnYX...>..(Luh...g?..Y..._.)p..?..yp.H6.@......G..q.K...E.....>cF..........
:......A..L.w2..<..p@.R.....r..I..0...........=..-xzY%.....\..WR........Il.d.8......w..b$2J.....'.~]...O8.u.^{%.D.h.'.dz.}*..E.....3._..h..].........5..i7.p...<..%.L......s...4M#............q....+..$r	c.T6z4.....

GET /five/0/visual/voyager/Build/images/topgradient.jpg
Referer: http://158.69.153.134/five/0/visual/voyager/Build/BuildTop.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3


HTTP/1.1 200 OK
Content-Type: image/jpeg
Last-Modified: Sat, 01 Mar 2003 20:00:18 GMT
Accept-Ranges: bytes
ETag: "0359d2e2de0c21:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:53 GMT
Content-Length: 733

......JFIF.....H.H.....C....................................	.	..
...


......	..
.........C............................................................................".....................................	
.....................}........!1A..Qa."q.2....#B...R..$3br.	
.....%&'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz.......................................................................................................	
.....................w.......!1..AQ.aq."2...B....	#3R..br.
.$4.%.....&'()*56789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz....................................................................................?....(...
*........N...W=...........?.Es.R.....fs.....+......#.........i..)........e...3E.P0.....(.4P.E.P.E.P...

GET /Five/Visual/Clusters/PGI/images/FacKind_PGIFarms.jpg
Referer: http://158.69.153.134/five/0/visual/voyager/Build/KindList.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3

HTTP/1.1 200 OK
Content-Type: image/jpeg
Last-Modified: Thu, 08 Oct 1998 20:33:38 GMT
Accept-Ranges: bytes
ETag: "03db4edfaf2bd1:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:53 GMT
Content-Length: 2818

......JFIF.....H.H.....C......................
.....
...
..
...
............................C.......	..	.
.
........................................................<.<..".....................................	
.....................}........!1A..Qa."q.2....#B...R..$3br.	
.....%&'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz.......................................................................................................	
.....................w.......!1..AQ.aq."2...B....	#3R..br.
.$4.%.....&'()*56789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz....................................................................................?...._.../..m3O....w5...,Z#.#x..f..QCO.....^.._.>6.u+.7I.=......N..../.W......;W.......~5.W.;.}"./.j...!%@..L;.z.Q.$..1.}....&..#B.Q...4.c.\.#F...
H.9'.h...y...?0...2.l.e	Ct~\..........x/S...l.4
CM.9@...Ew!ln...QP......5Y4.w...1..t..R..p...-.2.8...A.}....&.....N]......i--.\....T"1.@v..)....._..=FW/....c.1..>;.c.$. -..............1i;.......c.S...9....4:.....)...........r#..eq.r./.]'......v...Y.4 w.\K..{T..d..O\..k....<Z.Sjw..G.S..<.*.4......N... ...u...7...D...+...0.....A S.(.@.|......rs..z[..../[.1.........0..}..xFI-..95.&x..2C.....T.*..N3...F./....!X...#.}...N......t..Q..k.h....fh.k.e..P.pV..xc<.....zXk.-...ZH.....m<.J3.n...G.x........WVd.D.-.A..3+\Zd..r........g...?...Zh.r....;..v7,Y.m..'.N...8...W.....W.H.@.'.Ef..E.@..O....m..|Q...Cn/.....ps.c...i.
"..'F.o&~.|T.W.O.'.v?.<)e.k. ..C.Kz$6.`..7........[9.....Y.\.......D.....?
h.E5.#. ....N..Ny<......iK.....e.../@.N.{...:X..PJ.w
..\s.........a.k.......x..T.T...X..v......B......8..O..g..W....x.W.b...e...'...._y..0.dMy&.>z.X.1...k~..s.[.U.o.N..oh..$..2.'29..@...f.M`x....O..i.i.6k}*...Gh......c..h.5ab....[...[..._K....".~Q...WS.z.fv...<v....,.l.H...J.eh.
.uKs.....Py..S.Y........i.(....;)%...?.p?.|C...Mq$.^.i..Y........~.J...Hf..3...4+XN.>....|0......,.$.t...b.....-...<....z...;H.O.....n!.....!S.*n#.\e..'!........T.|Y.K...>n.,...4O.....#.`.g...4.........M......
.....'8.8.JQp....C.Q.9&...._......_..[.M...$Q.#.%.wt....:..B.g/..|P..q...7..iV.o*,....C..-..\...G#9.
......zu..`".....K8%.X@
.\..r..{....	......u...u{}.k.V-(\]...V.X.b...=.:q^B.K.xIr.l._C..!Jv..O5........}.U./.,n<..*2..d.g?x....:V-....ec4.....c+.....u.7....G.....[=...~e.......CFH.d....9........>.;.....,x#..Oz....	.Ir....|F...V...i.m.s.@R..#j...u....K3.n.?zOF....W..H....:.[.b@......&,.O8..1...U....Y.M..;r.5.B...}.........LY4.6..:B..l$(f g.?...msH.......MB...j....WXQ..r......u.....nLm,"GpN.9........iU...*r.s.|..?..-N=gG.F.e.|.f.....-....{}9......~!.o&.....h..n.m.Wl0e%.0...oC.4...............0.:q.z....G..
...K.V	n.R...
...8...I..?....S.%)m......o.|Z..._......!...I.G.-...*...y..YW.d....|O...?./........D..	9....?.....m....WN........o
.U.s.....1.M...ao.Am-..P....,.......[..c.w:g.S....=}..CN.R....k.-......1...B...).^tb.....#>c6s..55.v.M.:...w~..../....r...".b..1L..

GET /Five/Visual/Clusters/PGI/images/FacKind_PGIResidentialFacilities.jpg
Referer: http://158.69.153.134/five/0/visual/voyager/Build/KindList.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3

HTTP/1.1 200 OK
Content-Type: image/jpeg
Last-Modified: Thu, 08 Oct 1998 20:43:32 GMT
Accept-Ranges: bytes
ETag: "072c14ffcf2bd1:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:53 GMT
Content-Length: 3366

......JFIF.....H.H.....C......................
.....
...
..
...
............................C.......	..	.
.
........................................................<.<..".....................................	
.....................}........!1A..Qa."q.2....#B...R..$3br.	
.....%&'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz.......................................................................................................	
.....................w.......!1..AQ.aq."2...B....	#3R..br.
.$4.%.....&'()*56789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz....................................................................................?......,-|3.....\]I3.,l.8bGX.....4.`..g...:=...V...u.HT..5........#.O..#...I........!..;.6..-j.U...X......;....A.w 
....>..~.a.x./...D.....)...K.4..y......f"PA.S.T.`y.1Uy:..h9.C....^...w%......F..d.,cL.-..T..#.^...X.....?.*/...`....C...N...}G.>..
t....H....k......./.Z....M.)...h....7)...?.#....._.W.......	....5.`...hIk.4K-......p...`O..N>a.....^....z....n.......K..Z.E...y..B.Gl.....1..$..k.|M./.Ky"..C]..``h.P.$c.L..s..e........$./.....<....0..gx.j..1]....(8.....<_..R_
.A..Z.G..I5......'...72....H.# (.c..U%.=.8...E...g.4..w...vq. .W...$.) ..l..2A.F.J`....j.c...k...7.......U....H.<..2.,..........p....#T....Cwo+G4a.lppW ....z.wG..>...mZ.o.7....m5C....w>...P..F...cm	....."%fPL.N....K..>?..E...^..%.........
D.G..x.I|.&.n
.'..?5?d.
..r|"....=O..$....r.mCR.w.C.h &vP&.....#...cW......__...}QtV....k........../m.gs.9.w&.~^...1.,o.]...W/\.,.~W..K.....|S.f..[.j..kBQ.ek......J:........%. .-.^M.G._..*C.x.......?....qu.......a..-.F.(........ZD.....M;P....<)...w.$..d1]..z6.
...O$.a.i.1g_.UfA+G.b"........Z........i.Z...i.o.5...C}.....7.%..fS:.........M.E.....~~Fu...'.....H.^...6S..x.^..(.'.N....k....Q.Z.6O.&.=....sX...I.
.G........f+....].X..FUs)x..]p..Ue.1.
__....._.y.*...:.....40.d.4....#..w.....-y...
..Z..x.V....f..4.q....$...C!v..L.M..d(*.k...S...'.Z|.._....qxK.E..<A>.e....{k..3....!`.a.o...O.........uX.Xn-.(.1.Gt.../...I..=z...G.m.._......">=.y`.,...J...31...{`FU.
..)....k.....+.oe..q<.$...2J..6.......D.........a.......uu....z..6..%..e...i...:..fJ+m..c}....].<Iq..].....n.....4.Y..%..w.[...7;..........=.........&}B..Z:..+..,l...
. .I7.......S...|W.x?].\...E.:...-.........q..j.9v4..wF....5.b..5).K.;.z;..J.?/>..j.	_V...O..Z..m......&9$.y.dG..nb..B...k}.m22..9......I.......+<.~ .F.c.Z...[..O
.....)....j0A&.6/..-b..~....9&....8.an..Dm..hb.....S6H.......{.O..H..Q.xS\....C.......{l.t..1E.]_`.|.#..j....4..qI.....D..,O....]/.....&.^..M.....I=....=b..........Sm...ro/...s.....^ ...r.
fy.I.F.....@`2&....*...K".pB....:.....O.W.....R....;C,h.....A@b..c}.......N....;......mk.....ngh.D.3.Y.Hce.X.r..,....zp..-.....R.......I.....A..I.E.......F.K........".w..:`........c...;..J.....9..	$.g.q.k...hK.w..P.e.X..Z...4.q.}...RG.8..$..f.]Mf....H.. `.!..A>.....J.Vv9...=g.....7.........aK.5	.... g."..I.	...u +...~....s.{V...Z..49-d.>.i6...C..70!.A..@9.
~v|).
..6yQ.....W........B......e0..d<.b.@#..z..q8Xb.r.v;....d.l....W..nu.....6....m..-,.o..9~.$o....@....I.<9.=....S.........Y...:........A.7@.%..C.]..bP.o...cN.%....R..8.1$.."'.v..c.:t.....[..k....!U..._.aO..29....8.*S..m.z.m....S~....|...=....z59.tH...Xm..R...<...3klWR...G>Q....eg..J.......y.........b.Y.ieI...I;.v`.`..'..s.i6..$.....r7.&._b..n.s..<..e^$.Z...bH......PSa...&F'.@0...<=:sz_.I.'...:?..c5..u}N.Q..E...33..WoW;QN.<.:x...y..$fI.w&=.8.....j....%............z.\......p:.^."..{...

GET /Five/Visual/Clusters/PGI/images/FacKind_PGIPublicFacilities.jpg
Referer: http://158.69.153.134/five/0/visual/voyager/Build/KindList.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3

HTTP/1.1 200 OK
Content-Type: image/jpeg
Last-Modified: Thu, 08 Oct 1998 20:38:08 GMT
Accept-Ranges: bytes
ETag: "0f8a28efbf2bd1:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:53 GMT
Content-Length: 3111

......JFIF.....H.H.....C......................
.....
...
..
...
............................C.......	..	.
.
........................................................<.<..".....................................	
.....................}........!1A..Qa."q.2....#B...R..$3br.	
.....%&'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz.......................................................................................................	
.....................w.......!1..AQ.aq."2...B....	#3R..br.
.$4.%.....&'()*56789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz....................................................................................?.......e...i[..jY.~....../..R......O.kM.C`..2J.fb.+..T!%@o.q8..~..I{.[..
_l..8Q.... v.N....?.<G./..j...|....
]".w...V&9K	-d...1...o.N3..8.I3....gzQ....o.g..
.;-;.>
..]B..+.mo-...w.BW9^Q.V.R....`...3....Q...s_..*.....i./.7....?..j.I.F.._y..Ucq.S....(......x..h7(c!#..;.......j.^.4d..;.Z..Bi...$.
.......L;...%..._.F..9..C...)F^..._...-........M.SG^C,..PM..J..f..B..2.R8......99$....w..q.....kq2......Fq...)...#....$^.j....*e....R........um2..7zu.....I" ..}3.=y.f..|dC....IV[..a..
..y.=...N}pW.R..].......`eF|.w:.....J..	6.......d...^..S..k...|...?..1ge.....Wfk.....@g,.<.0....d....f..Y,.<7..V.P.......9Z.Y..#.H_..}.qUV.5....ME/......N...6...w....../..M.j7W.y...N.....$i...9P	..!@.../.>1....{m>..&........].........-...!.F....x..../..h.z..t..F.I-.O......*B...@.X1g....?[....:........+.ci..I.T..fGY\...(.%GC.~....J.W.W........I.f..>..).i.......cW..... ..{I.......i.wJ..^...........F...../..<..`..u.....A.=b.[..xg.V...6q.pO..f..+E..	+F......|/......GC..7.....R...%_...fa...R.<..r73"....n?i...`.}.....9w.....Z....
..!.G...	|....o..p.....;.
.~..Qb.'Q...
...|..c.........H.mwO.I.....k...X.X...^..$BT...0..<).n.._.+.L.....\];._.~..c..|.(.a&...HZk..c..efF^.k.o,yL....G.g.'...X.....Zn.k.Om........ur$..!.#S..8<.J.=...Z'...U.UV~GC.K.:.|f...........K...6...
eG...?Q.x'....K..E}-..Kf..0..`.=...0.....'..2[....>1...M.t........d.a4/."m1J...m.2.....z...W...8....ez..|q..^3.4).DsC.C$.Y....p.D.8.*.NJIt..x
R....>......~.^...4.i"...$}[W.u..E!..d*.!...*.......m....<a....s...>..m....p..7G,..,m.x.3..p@Q.Ek......5..D.........Ti...fi..v..Sb:.^6..kRmo..........	i...A.....4D$&Ug.4Q.e.u...o...".nuW4.}..r....<o.......5..Z.....1.....pby.nA...Y.bq........s...}2..v.~..X.Z.R..u}*M..i....$./.m.....	.-W....-f.....|+.]..Z.............Co]..~b.T.'[.......Qh.......\.......$....._..@.L..(W).S...p...9...mu...i...R|......x.[.|e,>...<)......[>...A,..S(0	.:...m.'.>$~.........g..._...J.M..Z.8..9.....)...A9a..G.....R_.:x...Q.......q...._b......3.O...u.WH..E....u..".J.~a(y....z.f.&.X.A....p...m.Y|C..u........&..`t..[ ....`.I...........a..CR.'.Zyc.cV
..D...J....T._......W....K.....YX.$.......$`..*.uSgbe....m?...#...$......MGV.mv.`#...R.nP...2..
0.n.x]3...|.O}...N..	..l,..{uV.`#..F..67n*..L.x...Gs.xF.MB+mB..)....4.C..._;p$p.....k...W....p>.n.ZIr.....Z(Tr.`.........%B.........g
./Uso]...9..A...3.,.&...i.HX.e~Eg
w..38%.h&....e..0[....."...;.5.....-	..=.dL.n..'hQ....>1...".V.O...l..Yca.$..@...>.W...'...M.41H.$..`.2...$..6	.=....C.Jj.Z..9...?.B..U...f.!k..iq&....6P83L...[...9.&1_1.j...#H.,h#..."..G|..$.J+..8S.,U..b.....

GET /Five/Visual/Clusters/PGI/images/FacKind_PGISpecial.jpg
Referer: http://158.69.153.134/five/0/visual/voyager/Build/KindList.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3

HTTP/1.1 200 OK
Content-Type: image/jpeg
Last-Modified: Sun, 16 Jul 2000 20:13:50 GMT
Accept-Ranges: bytes
ETag: "013de5a62efbf1:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:54 GMT
Content-Length: 2651

......JFIF.....H.H.....C...........................	.

	.		
...
...		
.
......
.............C.............	.........................................................<.<.."................................	.....9............	............!...."1..2AQa.#B	$3..4Cq....................................'.......	...............!1.."AQa..................?..|-.+....|.o...!.Y........
N..L..Q.v.. .......[x..+c.k...(.......WZ....<.....c..N?...5.....h.
..V..(.(/.....F.t...Zim....RL<..hU.I'.P...[.d.G.@.R......_).+.o{.j...U.%..[.+
..).Z..Y76.
.aW..H..B._.=...._e.i.....).U........v...H8.n..}..zZ....Y..=.h...UH..e...>....3...~zF.....GIYOQ.zy.V
...h....r02A.q..~...iGM.............c.m!:.-..(..UC.....`y....H...6J......).9...L....<..G.F.:..fwi\..IP..< <.O....$...h.....@..,.......O.:..b,UV*.I...w.V....,.G.........*fX.......7e..p...@.i:..x. ..#....a..q.x....|.P.v..7.....K\.@.(g.Y=..	.]..?~.Z0..-.
T.*-..
.m.h....z...5c0...$f[..oV...../.......:..I...._.$.....V....i.........i...M....w.R.8.c....7..D.].I.j./|fYm.WV...jTSP6..]b!...+>6.....W...X.-.4z.[S......QQA..\.>\Q.*]..\(8.q.h5...ng..rdm.....}9.uM^...F..EO[s...o....Q..v....
.....D...wvM.......X...5...f..)8-.r	[.....L.......!.m_.wz.k_mu.f..QY...,cn....FXc.G8.....qmz6.l.\...tTv.qS3.;I..@.\aW.,<..P.. .eTk....{k......'.wQ ..q.rx..	?.?....;.k...JX...K.4..	L.c...;.2...0.r:fj.eU
]..o.IQAO+...6...n3......v..w.2.>:....j`.B.Yx.....2.....?
.|...'qu....t.h.Z+Z...<r..tq.u.8..nr.O..*.z.........o..E].3?....'8....zg\u.D=...^j$.....E.t.D;.4..c.[ ..... ....p...ZDIYZ.DF.......e..T`;...&..V5.N[....!4.....J..%.....6.>.h...dr9l.l.#.....:b.r..,.Z.).{..PT.D....p..RG' ....O..5h...L.*X.kO...c.)..1......q..89......nX..YQ..`.4.A..S..(......<....pp..s^.I..]..
K.........5..v$4*X.b. .D!.>.G.....{U..H.k..yd.B........6TS...pF.n..@.@.....>...y~d..EP...).h...=.a..c.....zs.......F)..+k.oFD.h.&..P@.9e<.@..-`..X..........h...|.."y...
J.4n.k..Q......r..~..[..0.............sY..8..fH..	..Ll.]..4cp'.y<.....-Ow.:....).j...W.$...D..@.j..B.
...A.....^....]t..........*.-.}.9.._.C;.n3...'...`Q:..:gHv.E..u....-......^?^..T..{.....U..8.........ei(f....=..G..#=.b..46.......6J.2?.Ui.....tG.B2.3...,{a.-.[..|...f2i..I.e.y..
..
A
I......UE..........u.d.c.[.4..".Ib...H.2	.,z.
..w....A..&0......	...q.=fO....y.OK.n.p...
.8.=d.b.....}....tV.99..=....N...Il...n......5v..f	:K...b.)/.q..O...-...Ma....?E!I*.H`..Y.3..Y.=.0.....:..l.yjD.j.*T..t.......XQ..E..HA..q...:.;..x...+<.=...J..gc.[.).<CiZ.UKmH.Z.`P.R....*.)r...w..<...w
>..q;.Y.{or.{Um..E.....-{T...z.K
.!G..aJ.O.v[*N..=.7c>B....|E..-E,&.H.6wm.2=K....m...>..U.+...,..x.......L.f......A.......#."..wzI'9...Ru....6;U
5..m5....s.R.....c........(j1..g....s...F..r...8.X.R. .T.@.c....j.rLr..uP>O....

GET /five/0/visual/voyager/Build/FacilityList.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=PGI&Kind=PGIDirectionFacilities&KindName=Headquarters&Folder=00000024.PGIDirectionFacilities.five&TycoonLevel=0
Referer: http://158.69.153.134/five/0/visual/voyager/Build/KindList.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=&Tycoon=SPO_test3

HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Expires: Wed, 18 Feb 2026 21:21:55 GMT
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:56 GMT
Content-Length: 6468



<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML//EN">
<html>

<script language="JScript">

	var CellCount = -1;
	var Selection = -1;
	var Focus     = -1;

	function switchInfo()
	{
		for (i = 0; i < CellCount; i++)
			{
				infoBlock = document.all["infoBlock_" + i];
				infoBtnLabel = document.all["infoBtnLabel_" + i];
				if (infoBlock.style.display == "none")
				{
					infoBlock.style.display = "inline";
					infoBtnLabel.innerText = "Hide info";
				}
				else
				{
					infoBlock.style.display = "none";
					infoBtnLabel.innerText = "More info";
				}
			}
	}

	function onBtnClick( command )
	{
		var td = getCell( event.srcElement );
		if (td != null && td.tagName == "TD")
			switch (td.command)
			{
				case "build" :
					window.navigate( td.info );
				break;
				case "moreinfo" :
					switchInfo();
				break;
			}
	}



</script>

<script language="JScript" src="../includes/FrameButtons.js">
</script>

<script for="Document" languaje="JavaScript">

  function ShowCell( CellIdx )
    {
      if (CellCount > 0)
        {
      	  if (Selection != CellIdx)
            {
          	  Selection = CellIdx;
      	  	  var i;
              for (i = 0; i < CellCount; i++)
                if (i == CellIdx)
                  {
                    document.all["Cell_" + i].style.display = "inline";
                    document.all["LinkFrame_" + i].background = "images/sel-itemgradient.jpg";
					if (document.all["LinkText_" + event.srcElement.altid].available == "1")
          				document.all["LinkText_" + event.srcElement.altid].style.color = 0xFFF8DC;
                  }
                else
                  {
                    document.all["Cell_" + i].style.display = "none";
                    document.all["LinkFrame_" + i].background = "images/itemgradient.jpg";
                  }
            }
          else
            {
              document.all["Cell_" + Selection].style.display = "none";
              document.all["LinkFrame_" + Selection].background = "images/itemgradient.jpg";
          	  Selection = -1;
        	}
        }
    }

  function doItemMouseClick()
    {
      ShowCell( event.srcElement.altid );
    }

  function doItemMouseOver()
    {
      if (event.srcElement.altid != Selection)
        {
          document.all["LinkFrame_" + event.srcElement.altid].background = "images/hi-itemgradient.jpg";
          if (document.all["LinkText_" + event.srcElement.altid].available == "1")
			document.all["LinkText_" + event.srcElement.altid].style.color = 0x000000;
      	}
    }

  function doItemMouseOut()
    {
      if (event.srcElement.altid != Selection)
        {
          document.all["LinkFrame_" + event.srcElement.altid].background = "images/itemgradient.jpg";
          if (document.all["LinkText_" + event.srcElement.altid].available == "1")
			document.all["LinkText_" + event.srcElement.altid].style.color = 0xFFF8DC;
        }
    }

  function doBtnMouseClick()
    {
      event.srcElement.src = "images/buildnowdown.jpg";
    }

  function doBtnMouseOver()
    {
    }

  function doBtnMouseOut()
    {
      event.srcElement.src = "images/buildnowup.jpg";
    }

</script>

<head>
	<title>Facility List</title>
	<link rel="STYLESHEET" href="../voyager.css" type="text/css">
</head>




<body>

<!--<img src="/Five/Visual/Clusters/PGI/images/FacKind_PGIDirectionFacilitiesDisabled.jpg" width="60" height="60" style="position: absolute; z-index: -10">-->
<table cellspacing="7" width="100%">
<tr><td>
	<div class=header2 style="color: #FF9900">
		Headquarters
	</div>
</td></tr>
<tr><td>

<table cellspacing="0" cellpadding="0" border="0" width="100%">

    <tr>
      <td width="100%" id="LinkFrame_0" background="images/itemgradient.jpg" onMouseOver="doItemMouseOver()" onMouseOut="doItemMouseOut()" onClick="doItemMouseClick()" altid="0">
        <div id="LinkText_0" class=listItem available="1" style="margin-left: 5px" altid="0">
        Company Headquarters
        </div>
      </td>
    </tr>
    <tr id="Cell_0" style="display:none">
      <td width="100%" background="images/vertgradient.jpg">
      <table cellpadding="3" cellspacing="0" width="100%">
      <tr>
      <td align="center" valign="middle" width="64">
		<img src=/five/icons/MapPGIHQ1.gif border="0"
		
			title=""
		
		width="120" height="80"
		>
      </td>
      <td align="left" valign="middle">
      	<!--/five/icons/MapPGIHQ1.gif-->
	
      	<div class=comment style="font-size: 9px; font-name: Arial; font-weight: normal">
			$8,000K<br>
			<nobr>3600 m.</nobr>
		</div>
		
		<img src="images/zone-commerce.gif" style="filter: alpha(opacity=100)" title="Building must be located in blue zone or no zone at all.">
		
      </td>
      </tr>
      <tr>
      	<td colspan="2">

		
        <div id=infoBlock_0 class="description" style="font-size: 10px; padding-left: 0px; display: none; color: #749990">
			
		</div>
		<table style="text-align: center">
			<tr>
				<td>
					<table>
						<tr>
							
							<td class=button align="center" width="100"
								onMouseOver="onMouseOverFrame()"
								onMouseOut="onMouseOutFrame()"
								onMouseUp="onMouseUp()"
								onMouseDown="onMouseDown()"
								onClick="onBtnClick()"
								info="http://local.asp?frame_Id=MapIsoView&frame_Action=Build&FacilityClass=PGIGeneralHeadquarterSTA&VisualClassId=602"
								command="build"
								normColor="#345950"
								hiColor="white">

								Build now
							</td>
							
						</tr>
					</table>
				</td>
				<td>
					<table>
						<tr>
							<td id=infoBtn_0 class=button align="center" width="100"
								onMouseOver="onMouseOverFrame()"
								onMouseOut="onMouseOutFrame()"
								onMouseUp="onMouseUp()"
								onMouseDown="onMouseDown()"
								onClick="onBtnClick()"
								infoBlock="infoBlock_0"
								infoBtnLabel="infoBtnLabel_0"
								command="moreinfo"
								normColor="#345950"
								hiColor="white">

								<div id=infoBtnLabel_0 >
									More info
								</div>
							</td>
						</tr>
					</table>
				</td>
		</table>
      </td>
      </tr>
      </table>
      </td>
    </tr>


</td></tr>
</table>
</table>

</body>

<script for="Document" languaje="JavaScript">
  var CellCount = 1;
</script>

</html>

GET /five/icons/MapPGIHQ1.gif
Referer: http://158.69.153.134/five/0/visual/voyager/Build/FacilityList.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=PGI&Kind=PGIDirectionFacilities&KindName=Headquarters&Folder=00000024.PGIDirectionFacilities.five&TycoonLevel=0

HTTP/1.1 200 OK
Content-Type: image/gif
Last-Modified: Fri, 28 Feb 2003 21:27:58 GMT
Accept-Ranges: bytes
ETag: "0c3674370dfc21:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:56 GMT
Content-Length: 4622

GIF89ax.P....),(-4+/9-1<.3=1<<<86344.C><D<6V=34A/5C1:K4;F8>R5FD<AV6D\9DX8YJ:fK:Id;Ga:Nk>EKKGHFVLFJWIYUJMSSMWWSVTU[\Z[VGOPuZEc\UlTCWvEXgVUhJff[ujZdv[xv[riJT^a\dddfcckkilgkvgwvhtuqyztmqn>BB.oS.|g.}h.sR.\?^.Jn.T{.tv.j..Y..k..k..x..t..y..p..f..z..n..u..u..Z..u..z..}...{................z..................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................!..	....,....x.P......	.H......*\......#J.H.....3j...a.. Cjl.e...(SB\..EK.*c..hdI..\.`YQd...@An!R.'..Nv`A.c	..P+.].R../Gjp!..H.,d..u....#d..8.....,..!..H.,c........f...b.....@....L.2Y.....K.%e..!s...#;Jh@P..
2....".)..m[`f.....K.p...H..fj.>.%..*.c...y......8"x..2hQ;W.#...*...!..L.....^.$K....g9}.;...S........i7\qoQ..N+....F.pC~).....yQ..f.7..r..U	..a.....C.U8h.
.....t....yx....r...%.`..+.qF
.9h.
1..b.!..E.q.!#.e4.c.g..#.5.xC.7.pC.1..d.F..G.0.H..Y..F.r8%.w`"9..I.yfGp.`..x|...3.1...eQC	.....H. ...n..
U..../..&.|,j".bN:..I.`C	....)Gk.p.	t......Ic.|t.'.JN.....`..c....+.AB.5x...G....s..E.e.;..0.
".8....^8k..3T...5tQ..6....q.a..........+.2l.D.]4..Dh.P.
.vA..-tq..\..o..jpl....*..:..
.;..Ch.P..x.{o
[..m.p|... .*C...........bVa..0.L..5|aB.8_<..Gxa.......%l`.......5X...P7.s........@...7.p.. \z..e#}2..*m..W..D.......b..	.....[$f...#.....PE.)N. .
......L.
.+z..Lt.... ...5.y......."..:B1...........}{N.X...	...
$.p....0C.3..|.K..P....B.4.>...q.B.!{.eS'....'....}.+H..6...,gx.C.v..
x.R%.@....,..V3.A.....  .0@`...3.. .*.^.fP;	..	X...V....@.>.`..x.+..@..(..r..L...*.....C.iAg|kA.....Q..7x.....#..X .@.f.6.......
f@.2.Pg
4A.....m...P.
*..0>.
m(......h.RK|.......`.f(..0..+FPs..A
uP.,..
...{b...=R..(.$... ..]^...tP........	"x..x......t..(..
Z*@.` ... ..|..>....`..H............8....x.D|.	....M.!.7P...@....`.rHe.b..i. .9.e.>...6......&z..^...@.	>..qR........."(.	g..........6..	.`.?..
D1..`...<...(@. .P..@ ...	....H..
..I....`..Xm'A...4..7E C.:....!P+.......@.
}......6....D...@..F..@..	.....`.|M'P....<..X..V..U. .	...."..&...p..K..8%=..<x.!....$../..^._.T.. .. ..8@..b....@C.......@.......>@.]......%...M.M{.....@.O@BbR..f.A
.
M.J......!...r@.......@."p......-.bQ.N.^...m...`....=K.N.P......Y..._P...`	R`..X.#.z..9...
P..d...]@..+..6...H,..@..T...5.. {.	.a.[(.]r...l..cx..B....e.3...bp.((A	....t9.....A...t.{..0@..m.........2I*.j...>u..H.......e3Y(Cp.0&.... .@.2@.$l`.!P..L...x..<.@.B.......P.q.p......X.qWM....q!.'."...0 ..5,.X0.:....A....*.i....@.....`Z.m......2>......s0..r...n....k..x..`.T;...Tt......{X.0`.@......9\G.c...H...|........pl...-@.\.P..L...G.
B........x.m...Y.8. ..S-._V....8@.8..! ...'8.....gO.)..|y`.....=......T>A.....F......4.{
jM.=.`..X...{.\o......1.P.. ..8..i..-.hWt.......x......3P.......@
~ F&..
].C`...r.@.(`A..^_..Y....q.l_<wD.....,p.....
....`.-(.
k......*..G....r...g`.Dp.D]@..+.	V...........JU..8`.
.......q....`..Yj......X...B....5.^.l..V..l`.  .2.....Dc...|>E.....F.dPu>..O.~4...$z.v~X.k.W{r.o.@\.P.w.D!A........`U..k..oQ..oP.I... ........$..H4..u.V.....@s..z%..J....g..~..v.uUV._.......0ks.....w..~.....!`ng...`_.&.o..G`/u0.O...`)
...........|  ...T. k.P.....p.6...$.aw..Wd.u.(..7Vgu..I.....Z...p.w.2....`.I.......`.'.M..o`._.{k....C	 J.....g'X. ....\. k	......Pcn6.,..B..(.k...Mu..G....).....Mp.W..]..~..}..k..<'y.0.. .i..{H.^@...3w..<e.#..9`..(......[.9.....P...H..X|.sA...E....Xe.)..-P.....8.....B..c .......z...H.
..M..j.....A..uP....K0j0 f...r..O...Pdr......0......o.&.&YUQ._..[2Y...sB..N....6a..p..=..o.....i..M...I..(.9.....#..!P..v{n.{.%g|...........4`...fo.X. c=..,p.I..(p.y	.{).}..-0.&	.Z .[........bfx..o..~..n....P.(....o........r.... g
...Q0.L......9.*..~..j...X.I@.........x.....`.vQ..[.w[9..1...F.D.o
p..._.y.Q..:..I.8zi.3...`....A`.A..X..J.......p..r.._
pXr..) .,0g.ec-z.
0.Q....gs..-P.9..z..{..G.6...W...vx.p.(z.3.P..r..P.5.G...p[4z.7..C..G..Q.X.(zW0....}..o.2........xR.j....5g.vv^..f..
`\..Fg...)..hz.. rB*.b..L..v..r....^....p...~]){..[...Q@..	.fi_k.z
5.j.."...I...)....&.$j.....@..@......c...H..j0.t.n'Wg.`....W.....F.;...]..........z....v.o..h...0...WwG.#....:.J....!.z,..,p..8g...V...z.j... N.@.......A..o.7.Y.,P.E..j.......N..c?...(...wC....H.:Y....}.....j...
.....GQ.5c..M(....m7P.bp..Q.t.....:..@.~.6.<'z../5..P..=..<...:.@0.5Xc..{4..40..R.c.....G.....L.kh.W2)....b{.	.....-..C..4.g
.v...h0..........?;.......,..b..W............E..D..+..k.....k.T@..{.<..k...Z.......w .Wp....O.)...;

GET /five/0/visual/voyager/Build/images/vertgradient.jpg
Referer: http://158.69.153.134/five/0/visual/voyager/Build/FacilityList.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=PGI&Kind=PGIDirectionFacilities&KindName=Headquarters&Folder=00000024.PGIDirectionFacilities.five&TycoonLevel=0

HTTP/1.1 200 OK
Content-Type: image/jpeg
Last-Modified: Sat, 01 Mar 2003 20:00:18 GMT
Accept-Ranges: bytes
ETag: "0359d2e2de0c21:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:56 GMT
Content-Length: 741

......JFIF.....H.H.....C......................
.....
...
..
...
............................C.......	..	.
.
..........................................................,..".....................................	
.....................}........!1A..Qa."q.2....#B...R..$3br.	
.....%&'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz.......................................................................................................	
.....................w.......!1..AQ.aq."2...B....	#3R..br.
.$4.%.....&'()*56789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz....................................................................................?....j(..D..(...5......j	(......w.h..h..u..E...VJ....B.ZN.ZN..)u4Ey...h..h.?.......(...(...(...(...(...(...(...(...(....

GET /five/0/visual/voyager/Build/images/hi-itemgradient.jpg
Referer: http://158.69.153.134/five/0/visual/voyager/Build/FacilityList.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=PGI&Kind=PGIDirectionFacilities&KindName=Headquarters&Folder=00000024.PGIDirectionFacilities.five&TycoonLevel=0

HTTP/1.1 200 OK
Content-Type: image/jpeg
Last-Modified: Sat, 01 Mar 2003 20:00:16 GMT
Accept-Ranges: bytes
ETag: "086c2d2de0c21:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:58 GMT
Content-Length: 674

......JFIF.....H.H.....C....................................	.	..
...


......	..
.........C............................................................................".....................................	
.....................}........!1A..Qa."q.2....#B...R..$3br.	
.....%&'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz.......................................................................................................	
.....................w.......!1..AQ.aq."2...B....	#3R..br.
.$4.%.....&'()*56789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz....................................................................................?.....+.s.
(..
(..
(..
(..
(..
(..
(..
(..
(..
(..?..

GET /five/0/visual/voyager/Build/images/sel-itemgradient.jpg
Referer: http://158.69.153.134/five/0/visual/voyager/Build/FacilityList.asp?Company=Yellow%20Inc.&WorldName=Shamba&Cluster=PGI&Kind=PGIDirectionFacilities&KindName=Headquarters&Folder=00000024.PGIDirectionFacilities.five&TycoonLevel=0

HTTP/1.1 200 OK
Content-Type: image/jpeg
Last-Modified: Sat, 01 Mar 2003 20:00:18 GMT
Accept-Ranges: bytes
ETag: "0359d2e2de0c21:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Wed, 18 Feb 2026 21:21:58 GMT
Content-Length: 775

......JFIF.....H.H.....C......................
.....
...
..
...
............................C.......	..	.
.
..........................................................,..".....................................	
.....................}........!1A..Qa."q.2....#B...R..$3br.	
.....%&'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz.......................................................................................................	
.....................w.......!1..AQ.aq."2...B....	#3R..br.
.$4.%.....&'()*56789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz....................................................................................?....+S...E.P.L...E......Xk.....E..2f./...~....t..k..X.}...z(..u......X.=O.E.=....w.k...QJ[.1..7.......H.[....j..R:.QE..(...(...(...(...(...(...(...(.....

Success building
C 147 sel 8184316 call NewFacility "^" "%PGISupermarketC","#28","#618","#117";
A147 res="#0";

ERROR - Duplicate building
C 98 sel 8161308 call NewFacility "^" "%PGIGeneralHeadquarterSTA","#28","#465","#388";
A98 res="#33";

# 13. Build roads (via Build menu)

GET /five/0/visual/voyager/Build/RoadOptions.asp
HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Expires: Fri, 20 Feb 2026 13:54:59 GMT
Server: Microsoft-IIS/8.5
Set-Cookie: ASPSESSIONIDQQTTQBRD=CAGJNDDAADCBMAAHOCLFJLLD; path=/
X-Powered-By: ASP.NET
Date: Fri, 20 Feb 2026 13:54:59 GMT
Content-Length: 2632



<html>


<head>
	<title>Road options</title>
	<link rel="STYLESHEET" href="../voyager.css" type="text/css">
</head>

<script language="JScript" src="../includes/FrameButtons.js">
</script>

<script language="JScript">

	function onFrameClick()
	{
		var td = getCell( event.srcElement );
		if (td != null && td.tagName == "TD")
			window.navigate( td.info );
	}

</script>

<body background="images/background3.jpg" bgcolor="#C4D7BD" text="#000000" link="#DDDB86" vlink="#DDDB86" alink="#DDDB86" topmargin="0" leftmargin="0">

	<div class=header2 style="color: #FF9900; margin-left: 10px">
		Roads
	</div>
	
	<table cellspacing="0" cellpadding="0" width="80%" style="margin-left: 10px">
		<tr>
			<td align="center" valign="bottom"
				style="border-style: solid; border-width: 2px; border-color: black; cursor: hand" 
				onMouseOver="onMouseOverFrame()" 
				onMouseOut="onMouseOutFrame()" 
				onClick="onFrameClick()"
				normColor="black" 
				info="http://local.asp?frame_Id=MapIsoView&frame_Action=BuildRoad"
				hiColor="#3A5950">
					<img id="itemImg_1" order=1 src="images/CreateRoad.gif" width="64" height="32" title="Build road" border="0" style="margin-top: 10px">
					<div id="itemLabel_1" order=1 class="link" style="color: white">
						Build<br>
					</div>
			</td>
			<td align="center" valign="bottom"
				style="border-style: solid; border-width: 2px; border-color: black; cursor: hand" 
				onMouseOver="onMouseOverFrame()" 
				onMouseOut="onMouseOutFrame()" 
				onClick="onFrameClick()"
				normColor="black"
				info="http://local.asp?frame_Id=MapIsoView&frame_Action=DemolishRoad"
				hiColor="#3A5950">
					<img id="itemImg_2" order=2 src="images/DemolishRoad.jpg" width="64" height="32" title="Demolish road" border="0" style="margin-top: 10px">
					<div id="itemLabel_2" order=2 class="link" style="color: white">
						Demolish<br>
					</div>
			</td>
		</tr>
		<!--
		<tr>
			<td align="center" valign="bottom"
				style="border-style: solid; border-width: 2px; border-color: black; cursor: hand" 
				onMouseOver="onMouseOverFrame()" 
				onMouseOut="onMouseOutFrame()" 
				onClick="onFrameClick()"
				normColor="black" 
				info="http://local.asp?frame_Id=MapIsoView&frame_Action=BuildRailroad"
				hiColor="#3A5950">
					<img id="itemImg_1" order=1 src="images/CreateRoad.gif" width="64" height="32" title="Build road" border="0" style="margin-top: 10px">
					<div id="itemLabel_1" order=1 class="link" style="color: white">
						Railroad<br>
					</div>
			</td>
		</tr>
		-->
	</table>
	
</body>
</html>

It's followed by a refresharea from server to allow use to see the road built.
C 505 sel 29862524 call CreateCircuitSeg "^" "#1","#248041616","#462","#403","#464","#403","#4000000";
A505 res="#0";C sel 41051000 call RefreshArea "*" "#462","#403","#3","#1","%1::462
391
462
403
17
15
7
6
0
0
462
403
462
419
15
13
6
4
0
0
462
403
464
403
15
49
6
0
0
0
:";

# 14. Access mail : inbox, sent, draft & send a Mail

RDO protocol to send mail : 

C 2172 idof "MailServer";
A2172 objid="30437308";
C 2173 sel 30437308 call NewMail "^" "%Mayor of Olympus@Shamba.net","%Mayor of olympus","%test subjct";
A2173 res="#30430748";
C 2174 sel 30430748 call AddLine "*" "%test message";
A2174 ;
C 2175 idof "MailServer";
A2175 objid="30437308";
C 2176 sel 30437308 call Save "^" "%Shamba","#30430748";
A2176 res="#-1";
C 2177 sel 30437308 call CloseMessage "*" "#30430748";
A2177 ;


UI HTML : 



GET /five/0/visual/voyager/mail/MailFolder.asp?Folder=Inbox&WorldName=Shamba&Tycoon=SPO_test3&Account=SPO_test3@Shamba.net&Password=test3&frame_Id=MailView&frame_Class=HTMLView&frame_Align=bottom&frame_Height=40%&frame_KeepContent=no&frame_ToHistory=yes&LangId=0


HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Expires: Fri, 20 Feb 2026 14:18:26 GMT
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Fri, 20 Feb 2026 14:18:26 GMT
Content-Length: 453



<frameset rows="70,*" framespacing=0>
	
	<frame name="Top" src="MailFolderTop.asp?Folder=Inbox&WorldName=Shamba&Account=SPO_test3@Shamba.net&Password=test3&TycoonName=SPO_test3" scrolling="no" noresize frameborder = "No"  marginwidth="0" marginheight="0">
	
	<frame name="Main" src="MessageList.asp?Folder=Inbox&WorldName=Shamba&Account=SPO_test3@Shamba.net&MsgId=&Action=" noresize frameborder = "No"  marginwidth="0" marginheight="0">
</frameset>

GET /five/0/visual/voyager/mail/MailFolderTop.asp?Folder=Inbox&WorldName=Shamba&Account=SPO_test3@Shamba.net&Password=test3&TycoonName=SPO_test3

HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Fri, 20 Feb 2026 14:18:26 GMT
Content-Length: 6709




<html>

<!-- Headers -->

<head>
	<title>FIVE Logon</title>
	<link rel="STYLESHEET" href="../voyager.css" type="text/css">
	<link rel="STYLESHEET" href="mail.css" type="text/css">
</head>

<!-- Scripts -->

<script language="JScript" src="../includes/FrameButtons.js">
</script>

<script id=lola language="JScript">

	function updateToolbar()
	{
		alert( "It works!" );
	}

	function createMsgInfo()
	{
		this.msgPath = "Lola";
		this.updateToolbar = updateToolbar;
	}

	document.all["msgInfo"] = createMsgInfo();

	function execCommand( command )
	{
		switch (command)
		{
			case "new" :
				window.parent.navigate( "http://local?frame_Id=MsgComposer&frame_Class=MsgComposer&frame_Align=client&frame_Height=50%&frame_Action=new");
				break;
			case "reply" :
				window.parent.navigate( "http://local?frame_Id=MsgComposer&frame_Class=MsgComposer&frame_Align=client&frame_Height=50%&frame_Action=reply&Folder=INBOX&MsgId=" + toolbar.currMsgId );
				break;
			case "forward" :
				window.parent.navigate( "http://local?frame_Id=MsgComposer&frame_Class=MsgComposer&frame_Align=client&frame_Height=50%&frame_Action=forward&Folder=INBOX&MsgId=" + toolbar.currMsgId );
				break;
			case "read" :
				window.parent.navigate( "MailMessage.asp?WorldName=Shamba&Account=SPO_test3@Shamba.net&Folder=INBOX&MsgId=" + toolbar.currMsgId + "&frame_Id=MsgView&frame_Class=HTMLView&frame_Align=client&frame_Height=50%&frame_NoBorder=True&frame_NoScrollBars=false" );
				break;
			case "delete" :
				url = "MailFolder.asp?WorldName=Shamba&Account=SPO_test3@Shamba.net&Password=test3&Tycoon=SPO_test3&Folder=INBOX&MsgId="  + toolbar.currMsgId + "&Action=DELETE&frame_Id=MailView&frame_Class=HTMLView&frame_Align=bottom&frame_Height=40%&frame_KeepContent=no&frame_ToHistory=yes"
				window.parent.navigate(url);
				break;
			case "open" :
				window.parent.navigate( "http://local?frame_Id=MsgComposer&frame_Class=MsgComposer&frame_Align=client&frame_Height=50%&frame_Action=open&Folder=INBOX&MsgId=" + toolbar.currMsgId );
				break;
		}
	}

	function onBtnClick()
	{
		button = event.srcElement;
		execCommand( button.command )
	}

	function onBtnMouseDown()
	{
		button = event.srcElement;
		if (button.state != "disabled")
			with (button)
			{
				state = "down";
				src   = "images/" + command + "btn" + state + ".jpg";
				execCommand( command );
			}
	}

	function onBtnMouseUp()
	{
		button = event.srcElement;
		if (button.state != "disabled")
			with (button)
			{
				state = "";
				src   = "images/" + command + "btn" + state + ".jpg";
			}
	}

	function onLoad()
	{
		document.all.everything.style.display = "inline";
		window.navigate( "MailSplash.asp?frame_Id=MsgView&frame_Class=HTMLView&frame_Align=client&frame_Height=50%&frame_NoBorder=True&frame_NoScrollBars=False" );
	}

</script>

<!-- Body -->

<body style="background-image: url(images/BrowserTopBackground.jpg)" onLoad="onLoad()">

<div id=everything style="display: none">
<table id=toolbar cellspacing="0" cellpadding="0" width="100%" currMsgPath="" updateToolbar="updateToolbar()">
	<tr><td height="40" valign="top">
		<table cellspacing="0" cellpadding="0" width="100%">
			<tr>
			<td align="left" style="background-image: url(images/tabsback.gif)">
				<map name="links">
				
				<area shape=polygon coords="91,30 194,30 176,18 113,18" target="_top" href="MailFolder.asp?Folder=SENT&WorldName=Shamba&Account=SPO_test3@Shamba.net&Password=test3&Tycoon=SPO_test3" alt=""></area>
				
				<area shape=polygon coords="171,30 274,30 256,18 193,18" target="_top" href="MailFolder.asp?Folder=DRAFT&WorldName=Shamba&Account=SPO_test3@Shamba.net&Password=test3&Tycoon=SPO_test3" alt=""></area>
				
				</map>
				
				<img src="images/inbox.gif" usemap="#links" border=0 width=296 height=30>
				
			</td>
			<td align="right">
				<!--<img src="images/MailTitle.jpg">-->
			</td>
			</tr>
	</td></tr>
	<tr><td height="5">
	</td></tr>
	<tr><td>
		<table cellspacing="0" cellpadding="0">
			<tr>
			<td width="10">
			</td>
			<td nowrap>
				<table>
					<tr>
						<td class=button align="left" width="100"
							onMouseOver="onMouseOverFrame()"
							onMouseOut="onMouseOutFrame()"
							onMouseUp="onMouseUp()"
							onMouseDown="onMouseDown()"
							onClick="onBtnClick()"
							command="new"
							normColor="#345950"
							hiColor="white">

							New
						</td>
						<td class=button align="left" width="100"
							onMouseOver="onMouseOverFrame()"
							onMouseOut="onMouseOutFrame()"
							onMouseUp="onMouseUp()"
							onMouseDown="onMouseDown()"
							onClick="onBtnClick()"
							command="delete"
							normColor="#345950"
							hiColor="white">

							Delete
						</td>
						<td width=10>
						</td>
						<td class=button align="left" width="100"
							onMouseOver="onMouseOverFrame()"
							onMouseOut="onMouseOutFrame()"
							onMouseUp="onMouseUp()"
							onMouseDown="onMouseDown()"
							onClick="onBtnClick()"
							command="reply"
							normColor="#345950"
							hiColor="white">

							Reply
						</td>
						<td class=button align="left" width="100"
							onMouseOver="onMouseOverFrame()"
							onMouseOut="onMouseOutFrame()"
							onMouseUp="onMouseUp()"
							onMouseDown="onMouseDown()"
							onClick="onBtnClick()"
							command="forward"
							normColor="#345950"
							hiColor="white">

							Forward
						</td>
					</tr>
				</table>
				<!--<img id=newBtn class=toolbarBtn src="images/NewBtn.jpg" onMouseDown="onBtnMouseDown()" onMouseUp="onBtnMouseUp()" onMouseOut="onBtnMouseUp()" command="new" state="">-->
				<!--<a target="IFC" href="DeleteMessage.asp?WorldName=Shamba&Account=SPO_test3@Shamba.net&Folder=INBOX&MsgId=" + toolbar.currMsgId >-->
				<!--<img id=deleteBtn class=toolbarBtn border="0" src="images/DeleteBtnDisabled.jpg" onMouseDown="onBtnMouseDown()" onMouseUp="onBtnMouseUp()" onMouseOut="onBtnMouseUp()" command="delete" state="disabled">-->
				<!--</a>-->
			</td>
			<td width="20">
			</td>
			<td nowrap>
				
				<!--<img id=replyBtn class=toolbarBtn src="images/ReplyBtnDisabled.jpg" onMouseDown="onBtnMouseDown()" onMouseUp="onBtnMouseUp()" onMouseOut="onBtnMouseUp()" command="reply" state="disabled">-->
				<!--<img id=forwardBtn class=toolbarBtn src="images/ForwardBtnDisabled.jpg" onMouseDown="onBtnMouseDown()" onMouseUp="onBtnMouseUp()" onMouseOut="onBtnMouseUp()" command="forward" state="disabled">-->
				
			</td>
			</tr>
		</table>
	</td></tr>
</table>
</div>

<iframe name="IFC" id=IFC style="display:none">
</iframe>

</body>

</html>

GET /five/0/visual/voyager/mail/MailSplash.asp?frame_Id=MsgView&frame_Class=HTMLView&frame_Align=client&frame_Height=50%&frame_NoBorder=True&frame_NoScrollBars=False&LangId=0
HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Fri, 20 Feb 2026 14:18:26 GMT
Content-Length: 126

<frameset rows="100%">
  <frame name="Main" src="MailSplashView.asp" scrolling="no" noresize frameborder = "No">
</frameset>

GET /five/0/visual/voyager/mail/MailSplashView.asp
HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Fri, 20 Feb 2026 14:18:26 GMT
Content-Length: 1019



<style type="text/css">

	.intro
	{
		font		: 11px Tahoma, Verdana, Arial; 
		color		: #496960;
		text-align 	: left;
	}
	
	a
	{
		font		: 11px Tahoma, Verdana, Arial; 
		color		: #496960;
		text-align 	: left;
		font-weight	: bold;
	}

</style>

<html>

<body style="background-color: black; margin-left: 0px; margin-right: 0px">

<!-- ignore this table (it is here only to center the page) -->
<table width="100%" height="100%">

	<tr>
		<td width="50" align="center" valign="middle">
		</td>
		<td align="center" valign="middle">
			<img src="images/MailSplash.gif" width=391 height=170>
		</td>
		<td align="left" valign="bottom">
			<div class=intro>
			Click on the <b>Inbox</b> tab to see the messages you have received.<br>
			Click on the <b>Sent</b> tab to see the messages you have sent.<br>
			In <b>Draft</b> you will find unfinished messages saved by you.<br>
			</div>
		</td>
	</tr>

<!-- this table was previously ignored -->
</table>

</body>

</html>

GET /five/0/visual/voyager/mail/MailFolder.asp?Folder=SENT&WorldName=Shamba&Account=SPO_test3@Shamba.net&Password=test3&Tycoon=SPO_test3
HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Expires: Fri, 20 Feb 2026 14:18:48 GMT
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Fri, 20 Feb 2026 14:18:49 GMT
Content-Length: 451



<frameset rows="70,*" framespacing=0>
	
	<frame name="Top" src="MailFolderTop.asp?Folder=SENT&WorldName=Shamba&Account=SPO_test3@Shamba.net&Password=test3&TycoonName=SPO_test3" scrolling="no" noresize frameborder = "No"  marginwidth="0" marginheight="0">
	
	<frame name="Main" src="MessageList.asp?Folder=SENT&WorldName=Shamba&Account=SPO_test3@Shamba.net&MsgId=&Action=" noresize frameborder = "No"  marginwidth="0" marginheight="0">
</frameset>



GET /five/0/visual/voyager/mail/MessageBody.asp?WorldName=Shamba&Account=SPO_test3@Shamba.net&Folder=SENT&MsgId=2691B06053334348R

HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Sat, 21 Feb 2026 18:08:18 GMT
Content-Length: 356

<html>

<!-- Headers -->



<head>
<title>Mail Message</title>
<link rel="STYLESHEET" href="mail.css" type="text/css">
<link rel="STYLESHEET" href="mailmessage.css" type="text/css">
</head>

<!-- Scripts -->

<script language="JScript">
</script>

<!-- Body -->

<body style="background-color: white">

test<br>

</body>

</html>

GET /five/0/visual/voyager/mail/mailmessage.css

HTTP/1.1 200 OK
Content-Type: text/css
Last-Modified: Sat, 01 Mar 2003 20:00:26 GMT
Accept-Ranges: bytes
ETag: "0e961332de0c21:0"
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Sat, 21 Feb 2026 18:08:18 GMT
Content-Length: 271


body
{
	margin-left		: 20px;
	margin-top		: 10px;
	margin-right		: 10px;
	font-family		: Tahoma, Verdana;
	font-size		: 10pt;
	font-weight		: normal;
	font-style		: normal;
	color			: black;
}

a
{
	color				: #777722;
	text-decoration 	: underline;
}


GET /five/0/visual/voyager/mail/MessageList.asp?Folder=SENT&WorldName=Shamba&Account=SPO_test3@Shamba.net&MsgId=&Action=

HTTP/1.1 200 OK
Cache-Control: private
Content-Type: text/html
Server: Microsoft-IIS/8.5
X-Powered-By: ASP.NET
Date: Sat, 21 Feb 2026 18:08:15 GMT
Content-Length: 5221




<html>

<!-- Headers -->

<head>
	<title>FIVE Logon</title>
	<link rel="STYLESHEET" href="mail.css" type="text/css">
	<link rel="STYLESHEET" href="../voyager.css" type="text/css">
</head>

<!-- Scripts -->

<script language="JScript">

	var selectedRow = null;

	function updateToolbar()
	{
		/*
		if (selectedRow != null)
		{
			window.parent.frames.item("top").document.all.deleteBtn.src="images/deleteBtn.jpg";
			window.parent.frames.item("top").document.all.deleteBtn.state = "";
			
			window.parent.frames.item("top").document.all.replyBtn.src="images/replyBtn.jpg";
			window.parent.frames.item("top").document.all.replyBtn.state = "";
			window.parent.frames.item("top").document.all.forwardBtn.src="images/forwardBtn.jpg";
			window.parent.frames.item("top").document.all.forwardBtn.state = "";
			
		}
		else
		{
			window.parent.frames.item("top").document.all.deleteBtn.src="images/deleteBtnDisabled.jpg"
			window.parent.frames.item("top").document.all.deleteBtn.state = "disabled";
			
			window.parent.frames.item("top").document.all.replyBtn.src="images/replyBtnDisabled.jpg"
			window.parent.frames.item("top").document.all.replyBtn.state = "disabled";
			window.parent.frames.item("top").document.all.forwardBtn.src="images/forwardBtnDisabled.jpg"
			window.parent.frames.item("top").document.all.forwardBtn.state = "disabled";
			
		}
		*/
	}

	function selectRow( row )
	{
		if (selectedRow != null)
			selectedRow.style.backgroundColor = "";
		if (row != selectedRow)
		{
			selectedRow = row;
			if (selectedRow != null)
			{
				selectedRow.style.backgroundColor = 0x193930;
				window.parent.frames.item("top").document.all.toolbar.currMsgId = row.msgId;
			}
		}
		else
		{
			selectedRow = null;
			window.parent.frames.item("top").document.all.toolbar.currMsgId = "";
		}
		updateToolbar();
	}

	function getRow( element )
	{
		if (element.parentElement == null || element.parentElement.tagName == "TR")
			return (element.parentElement)
		else
			return (getRow( element.parentElement ))
	}

	function onRowClick()
	{
		row = getRow( event.srcElement );
		if (row != null)
		{
			selectRow( row );
			
			window.parent.navigate( "MailMessage.asp?WorldName=Shamba&Account=SPO_test3@Shamba.net&Folder=SENT&MsgId=" + row.msgId + "&frame_Id=MsgView&frame_Class=HTMLView&frame_Align=client&frame_Height=40%&frame_NoBorder=True&frame_NoScrollBars=False" );
			
		}
		event.cancelBubble = true;
	}

	function onRowDblClick()
	{
		var row = getRow( event.srcElement );
		if (row != null)
			window.parent.navigate( "MailMessage.asp?WorldName=Shamba&Account=SPO_test3@Shamba.net&Folder=SENT&MsgId=" + row.msgId + "&frame_Id=MsgView&frame_Class=HTMLView&frame_Align=client&frame_Height=40%&frame_NoBorder=True&frame_NoScrollBars=False" );

	}

	function onPageClick()
	{
		selectRow( null );
	}

	function onLoad()
	{
		document.all.everything.style.display = "inline";
		window.navigate( "MailSplash.asp?frame_Id=MsgView&frame_Class=HTMLView&frame_Align=client&frame_Height=50%&frame_NoBorder=True&frame_NoScrollBars=False" );
		var rowCnt = document.all.MsgCount;
		//alert(rowCnt.value);
		for (var i = 0; i < rowCnt.value; i++)
		{
			var Item = document.all["dateRow" + i];
			if (Item != null)
			{
				var strDate = new String(document.all["msgDate" + i].value);
				try
				{
					if (strDate.length > 0)
					{
						var p1 = strDate.indexOf("/", 0);
						var mth = strDate.substring(0, p1);
						var p2 = strDate.indexOf("/", p1+1);
						var day = strDate.substring(p1+1, p2);
						var year = strDate.substring(p2+1, strDate.length);
						var d = new Date(year, mth-1, day);
						Item.innerText = d.toDateString();
					}
					else
						Item.innerText = "?";
				}
				catch(e)
				{
					Item.innerText = strDate;
				}
			}
		}
	}

</script>

<!-- Body -->

<body style="background-color: #395950; margin: 0px; padding: 0px" onClick="onPageClick()" onLoad="onLoad()">
<div id=everything style="display: none">
</div>

<table id="MsgTable" width="100%" style="margin: 0px; padding: -10px" cellpadding="0" cellspacing="0">
	<tr style="background-image: url(images/listtopback.gif)">
		<td width=10% height=20>
		</td>
		<td class=mailFolderHeader width="20%">
			To
		</td>
		<td class=mailFolderHeader qwidth="50%">
			Subject
		</td>
		<td class=mailFolderHeader qwidth="20%">
			Date
		</td>
	</tr>

	<tr id="row_0" onClick="onRowClick()" onDblClick="onRowDblClick()" msgId=2691B06053334348R>
		<td align="right" valign="top" style="padding-left: 40px; padding-right: 20px">
			
			<input id="msgReply0" name="msgReply0" type=hidden value="">
		</td>
		<td valign="top">
			<span class=mailFolderItem>
			Mayor of Olympus
			</span>
		</td>
		<td valign="top" nowrap=true>
			<span class=mailFolderItem>
			test
			</span>
		</td>
		<td valign="top">
			<span class=mailFolderItem id="dateRow0" name="dateRow0">
				<input id="msgDate0" name="msgDate0" type=hidden value="3/9/2244">
			</span>
		</td>
	</tr>

</table>

<input id="MsgCount" name="MsgCount" type=hidden value="1">

</body>

</html>

